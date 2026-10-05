'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { SupporterSummaryView } from './supporter-summary-view'

interface Person {
  contact_id: string
  person_name: string
  since: string | null
}

/** /support — the people who have made this user their trusted person. */
export function SupportDashboard() {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // A supporter can step back at any time (migration 015).
  const leave = async (p: Person) => {
    if (!confirm(`Stop being ${p.person_name}'s trusted person? You will no longer see their summary.`)) return
    const { error } = await createClient().rpc('leave_support', { p_contact_id: p.contact_id })
    if (error) {
      setNotice(error.code === 'PGRST202' ? 'This option is not available yet.' : 'Could not update this. Please try again.')
      return
    }
    setPeople((prev) => (prev ?? []).filter((x) => x.contact_id !== p.contact_id))
  }

  useEffect(() => {
    let cancelled = false
    createClient()
      .rpc('my_supported_people')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('[support] failed to load supported people:', error.message)
        setPeople((data ?? []) as Person[])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (people === null) return <p className="text-muted-foreground">Loading…</p>
  if (people.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nobody has added you as their trusted person yet. When someone does, they&apos;ll send you a link, and their
        summary will appear here.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {notice && <p role="alert" className="text-sm text-destructive">{notice}</p>}
      {people.map((p) => (
        <Card key={p.contact_id} className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle>{p.person_name}</CardTitle>
            <CardDescription>
              Last 14 days{p.since ? ` · you've been their trusted person since ${new Date(p.since).toLocaleDateString('en-IN')}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SupporterSummaryView contactId={p.contact_id} personName={p.person_name} />
            <button type="button" onClick={() => leave(p)} className="text-xs text-muted-foreground underline hover:text-foreground">
              Stop being {p.person_name}&apos;s trusted person
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
