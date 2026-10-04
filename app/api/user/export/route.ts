import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Everything CALMER stores about the signed-in user. Child tables have no
// user_id column — RLS scopes them to this user through session ownership.
// biometric_reading and safety_flag were missing before, so the export was
// silently incomplete; and a failed query now fails the export instead of
// quietly producing a partial file that looks complete.
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const queries = {
      profile: supabase.from('profiles').select('*').eq('id', user.id),
      sessions: supabase.from('session').select('*').eq('user_id', user.id),
      conversations: supabase.from('therapist_convo').select('*'),
      emotionalStates: supabase.from('emotional_state').select('*'),
      ventingInteractions: supabase.from('venting_interaction').select('*'),
      biometricReadings: supabase.from('biometric_reading').select('*'),
      safetyFlags: supabase.from('safety_flag').select('*'),
      memories: supabase.from('user_memories').select('*').eq('user_id', user.id),
    }
    const names = Object.keys(queries) as (keyof typeof queries)[]
    const results = await Promise.all(names.map((n) => queries[n]))

    const failed = names.filter((_, i) => results[i].error)
    if (failed.length) {
      console.error('[user/export] failed tables:', failed.join(', '))
      return NextResponse.json({ error: 'Export failed — please try again.' }, { status: 500 })
    }

    const exportData = {
      user: { id: user.id, email: user.email, exported_at: new Date().toISOString() },
      ...Object.fromEntries(names.map((n, i) => [n, results[i].data ?? []])),
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="calmer-export-${user.id}.json"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
