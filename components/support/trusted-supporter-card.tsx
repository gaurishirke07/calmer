'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { inviteMessage, mailtoLink, whatsappLink } from '@/lib/calmer/supporter'
import { TRIAL_MODE } from '@/lib/calmer/trial-mode'
import { SupporterSummaryView } from './supporter-summary-view'

interface Contact {
  id: string
  display_name: string
  supporter_email: string
  supporter_user_id: string | null
  status: 'pending' | 'active' | 'revoked'
  invite_expires_at: string | null
  accepted_at: string | null
}

// Mirrors the cap in create_support_invite (migration 014): a contact counts
// while they can see the summary or still could.
const counts = (c: Contact) =>
  (c.status === 'active' && c.supporter_user_id !== null) ||
  (c.status === 'pending' && !!c.invite_expires_at && new Date(c.invite_expires_at) > new Date())

function describe(c: Contact): string {
  if (c.status === 'active') {
    return c.supporter_user_id
      ? `can see your summary since ${new Date(c.accepted_at!).toLocaleDateString('en-IN')}`
      : 'deleted their CALMER account; they no longer see anything'
  }
  if (c.invite_expires_at && new Date(c.invite_expires_at) <= new Date()) return 'invite expired'
  return `invite pending${c.invite_expires_at ? `, expires ${new Date(c.invite_expires_at).toLocaleDateString('en-IN')}` : ''}`
}

const MAX_CONTACTS = 3

/** Settings → add, preview and remove trusted people (docs/TRUSTED-SUPPORTER.md). */
export function TrustedSupporterCard() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [available, setAvailable] = useState(true) // false until migration 014 is run
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [invite, setInvite] = useState<{ name: string; email: string; link: string } | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    // Filter by owner: RLS also returns rows where this user is SOMEONE ELSE'S
    // supporter, which must not show up here as "your" trusted people.
    const { data, error: loadError } = await supabase
      .from('trusted_contact')
      .select('id, display_name, supporter_email, supporter_user_id, status, invite_expires_at, accepted_at')
      .eq('user_id', user.id)
      .neq('status', 'revoked')
      .order('created_at')
    if (loadError) {
      if (loadError.code === 'PGRST205' || loadError.code === '42P01') setAvailable(false)
      else console.error('[support] failed to load trusted contacts:', loadError.message)
      return
    }
    setContacts((data ?? []) as Contact[])
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads on mount
    load()
  }, [load])

  if (TRIAL_MODE || !available) return null

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { data, error: rpcError } = await createClient()
      .rpc('create_support_invite', { p_display_name: name.trim(), p_supporter_email: email.trim() })
      .single<{ contact_id: string; token: string }>()
    setBusy(false)
    if (rpcError || !data) {
      // The function's own messages are written for users ("at most 3 …").
      setError(rpcError?.message ?? 'Could not create the invite.')
      return
    }
    setInvite({ name: name.trim(), email: email.trim(), link: `${window.location.origin}/support/accept?token=${data.token}` })
    setName('')
    setEmail('')
    load()
  }

  const handleRemove = async (c: Contact) => {
    const what = c.status === 'pending' ? `Cancel the invite to ${c.display_name}?` : `Stop sharing with ${c.display_name}? They lose access immediately.`
    if (!confirm(what)) return
    const { error: rpcError } = await createClient().rpc('revoke_supporter', { p_contact_id: c.id })
    if (rpcError) setError('Could not remove them. Please try again.')
    if (previewId === c.id) setPreviewId(null)
    load()
  }

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader>
        <CardTitle>Trusted person</CardTitle>
        <CardDescription>
          Let up to {MAX_CONTACTS} people you trust see how you&apos;re doing: how often you use CALMER, how calm your
          sessions end, and the date if a conversation raised a safety concern. They never see your messages,
          memories or summaries, and you can remove them at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {contacts.length > 0 && (
          <ul className="space-y-3">
            {contacts.map((c) => (
              <li key={c.id} className="rounded-lg border border-border/50 bg-secondary/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{c.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.supporter_email} · {describe(c)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {counts(c) && (
                      <Button variant="outline" size="sm" onClick={() => setPreviewId(previewId === c.id ? null : c.id)}>
                        {previewId === c.id ? 'Hide preview' : 'What they see'}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleRemove(c)}>
                      {!counts(c) ? 'Clear' : c.status === 'pending' ? 'Cancel invite' : 'Remove'}
                    </Button>
                  </div>
                </div>
                {previewId === c.id && (
                  <div className="mt-4 border-t border-border/50 pt-4">
                    <SupporterSummaryView contactId={c.id} personName="you" preview />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {invite && (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
            <p className="font-medium">Send {invite.name} this link. It works once, for 7 days, and only for {invite.email}.</p>
            <input readOnly value={invite.link} aria-label="Invite link" className="w-full rounded border border-border bg-background px-2 py-1 text-xs" onFocus={(e) => e.target.select()} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(invite.link)}>Copy link</Button>
              <Button asChild size="sm" variant="outline">
                <a href={whatsappLink(inviteMessage(invite.name, invite.link))} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={mailtoLink(invite.email, 'Be my trusted person on CALMER?', inviteMessage(invite.name, invite.link))}>Send by email</a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">The link isn&apos;t shown again; if it&apos;s lost, cancel the invite and create a new one.</p>
          </div>
        )}

        {contacts.filter(counts).length < MAX_CONTACTS && (
          <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder="Their name"
              aria-label="Trusted person's name"
              required
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.slice(0, 254))}
              placeholder="Their email (they sign in with it)"
              aria-label="Trusted person's email"
              required
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={busy}>Create invite</Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
