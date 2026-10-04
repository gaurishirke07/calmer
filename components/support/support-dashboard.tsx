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
      {people.map((p) => (
        <Card key={p.contact_id} className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle>{p.person_name}</CardTitle>
            <CardDescription>
              Last 14 days{p.since ? ` · you've been their trusted person since ${new Date(p.since).toLocaleDateString('en-IN')}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SupporterSummaryView contactId={p.contact_id} personName={p.person_name} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
