import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Unified schema export. therapist_convo / emotional_state / venting_interaction
    // have no user_id column — RLS scopes them to this user via session ownership.
    const [sessions, conversations, emotionalStates, ventingInteractions, memories] = await Promise.all([
      supabase.from('session').select('*').eq('user_id', user.id),
      supabase.from('therapist_convo').select('*'),
      supabase.from('emotional_state').select('*'),
      supabase.from('venting_interaction').select('*'),
      supabase.from('user_memories').select('*').eq('user_id', user.id),
    ])

    const exportData = {
      user: {
        id: user.id,
        email: user.email,
        exported_at: new Date().toISOString(),
      },
      sessions: sessions.data || [],
      conversations: conversations.data || [],
      emotionalStates: emotionalStates.data || [],
      ventingInteractions: ventingInteractions.data || [],
      memories: memories.data || [],
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
