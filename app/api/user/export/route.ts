import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [sessions, messages, memories, moodLogs] = await Promise.all([
      supabase.from('chat_sessions').select('*').eq('user_id', user.id),
      supabase.from('chat_messages').select('*').eq('user_id', user.id),
      supabase.from('user_memories').select('*').eq('user_id', user.id),
      supabase.from('mood_logs').select('*').eq('user_id', user.id),
    ])

    const exportData = {
      user: {
        id: user.id,
        email: user.email,
        exported_at: new Date().toISOString(),
      },
      sessions: sessions.data || [],
      messages: messages.data || [],
      memories: memories.data || [],
      moodLogs: moodLogs.data || [],
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
