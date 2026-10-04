import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Everything CALMER stores about the signed-in user. Child tables have no
// user_id column — RLS scopes them to this user through session ownership.
// biometric_reading and safety_flag were missing before, so the export was
// silently incomplete; and a failed query now fails the export instead of
// quietly producing a partial file that looks complete.
//
// Every table is read in pages. PostgREST caps a single response (1000 rows by
// default), and the game alone writes ~40 emotional_state rows per session, so
// an unpaged export was cut off for any regular user without saying so.
const PAGE = 1000

type Page = { data: unknown[] | null; error: { message: string; code?: string } | null }

async function readAll(page: (from: number, to: number) => PromiseLike<Page>) {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) return { rows, error }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return { rows, error: null }
  }
}

// Tables a deployment may not have yet (created by a later migration).
const OPTIONAL = new Set(['handoffEvents', 'trustedContacts', 'supportRequests'])
const isMissingTable = (code?: string) => code === 'PGRST205' || code === '42P01'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Ordered by the primary key so pages never overlap or skip rows.
    const table = (name: string, ownColumn?: string, columns = '*') => (from: number, to: number) => {
      const q = supabase.from(name).select(columns)
      return (ownColumn ? q.eq(ownColumn, user.id) : q).order('id').range(from, to)
    }
    const tables = {
      profile: table('profiles', 'id'),
      sessions: table('session', 'user_id'),
      conversations: table('therapist_convo'),
      emotionalStates: table('emotional_state'),
      ventingInteractions: table('venting_interaction'),
      biometricReadings: table('biometric_reading'),
      safetyFlags: table('safety_flag'),
      handoffEvents: table('handoff_event'), // migration 013
      // migration 014; the invite token hash is not client-readable, so list columns
      trustedContacts: table('trusted_contact', 'user_id', 'id, display_name, supporter_email, status, created_at, accepted_at, revoked_at'),
      supportRequests: table('support_request'),
      memories: table('user_memories', 'user_id'),
    }
    const names = Object.keys(tables) as (keyof typeof tables)[]
    const results = await Promise.all(names.map((n) => readAll(tables[n])))

    const failed = names.filter((n, i) => {
      const error = results[i].error
      return error && !(OPTIONAL.has(n) && isMissingTable(error.code))
    })
    if (failed.length) {
      console.error('[user/export] failed tables:', failed.join(', '))
      return NextResponse.json({ error: 'Export failed — please try again.' }, { status: 500 })
    }

    const rowsOf = Object.fromEntries(names.map((n, i) => [n, results[i].rows])) as Record<keyof typeof tables, unknown[]>
    // RLS also lets a SUPPORTER read requests sent to them; this export is only
    // the user's own data, so keep requests made through their own contacts.
    const ownContacts = new Set((rowsOf.trustedContacts as { id: string }[]).map((c) => c.id))
    rowsOf.supportRequests = (rowsOf.supportRequests as { contact_id: string }[]).filter((r) => ownContacts.has(r.contact_id))

    const exportData = {
      user: { id: user.id, email: user.email, exported_at: new Date().toISOString() },
      ...rowsOf,
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="calmer-export-${user.id}.json"`,
      },
    })
  } catch (error) {
    console.error('[user/export] failed:', error)
    return NextResponse.json({ error: 'Export failed — please try again.' }, { status: 500 })
  }
}
