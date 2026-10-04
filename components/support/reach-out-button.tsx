'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { CRISIS_LINE } from '@/lib/calmer/safety'
import { mailtoLink, supportRequestMessage, whatsappLink } from '@/lib/calmer/supporter'
import { TRIAL_MODE } from '@/lib/calmer/trial-mode'

interface ActiveContact {
  id: string
  display_name: string
  supporter_email: string
}

/**
 * "Let them know I'm struggling": records a support request the supporter sees
 * on /support, and opens a pre-filled message the user sends themselves. No
 * server-side email: nothing leaves CALMER unless the user sends it. Renders
 * nothing when the user has no active trusted person.
 */
export function ReachOutButton({ className }: { className?: string }) {
  const [contacts, setContacts] = useState<ActiveContact[]>([])

  useEffect(() => {
    if (TRIAL_MODE) return
    let cancelled = false
    createClient()
      .auth.getUser()
      .then(async ({ data: { user } }) => {
        if (!user) return
        // Owner's own active contacts only (a supporter can also read rows
        // where they are the supporter, so filter by user_id explicitly).
        const { data } = await createClient()
          .from('trusted_contact')
          .select('id, display_name, supporter_email')
          .eq('user_id', user.id)
          .eq('status', 'active')
        if (!cancelled && data) setContacts(data as ActiveContact[])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (TRIAL_MODE || contacts.length === 0) return null

  // Logged before the link opens; a failed log must not stop the message.
  const record = (contactId: string) => {
    createClient()
      .rpc('request_support', { p_contact_id: contactId })
      .then(({ error }) => {
        if (error) console.error('[support] failed to record support request:', error.message)
      })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className={className}>
          Let {contacts.length === 1 ? contacts[0].display_name : 'someone'} know I&apos;m struggling
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reach out</DialogTitle>
          <DialogDescription>
            This opens a message you send yourself. They&apos;ll also see on their CALMER page that you asked for
            support.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {contacts.map((c) => {
            const text = supportRequestMessage(c.display_name)
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 p-3">
                <span className="font-medium">{c.display_name}</span>
                <span className="flex gap-2">
                  <Button asChild size="sm">
                    <a href={whatsappLink(text)} target="_blank" rel="noopener noreferrer" onClick={() => record(c.id)}>WhatsApp</a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={mailtoLink(c.supporter_email, 'Could use some support', text)} onClick={() => record(c.id)}>Email</a>
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm">
          If you&apos;re thinking about harming yourself, please don&apos;t wait for a reply. {CRISIS_LINE}
        </p>
      </DialogContent>
    </Dialog>
  )
}
