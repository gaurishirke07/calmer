import { SupabaseClient } from '@supabase/supabase-js'
import { ChatSession, CategorizedSessions, ChatMessage } from '@/lib/types'

export async function getUserSessionsGrouped(
  supabase: SupabaseClient,
  userId: string
): Promise<CategorizedSessions> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*, chat_messages(count)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching chat sessions:', error)
    return { today: [], yesterday: [], previous7Days: [], older: [] }
  }

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
  const sevenDaysAgoStart = todayStart - 7 * 24 * 60 * 60 * 1000

  const categorized: CategorizedSessions = {
    today: [],
    yesterday: [],
    previous7Days: [],
    older: [],
  }

  const sessions: ChatSession[] = data || []

  sessions.forEach((session) => {
    const sessionTime = new Date(session.updated_at || session.created_at).getTime()
    if (sessionTime >= todayStart) {
      categorized.today.push(session)
    } else if (sessionTime >= yesterdayStart) {
      categorized.yesterday.push(session)
    } else if (sessionTime >= sevenDaysAgoStart) {
      categorized.previous7Days.push(session)
    } else {
      categorized.older.push(session)
    }
  })

  return categorized
}

export async function createNewSession(
  supabase: SupabaseClient,
  userId: string,
  title: string = 'New Conversation'
): Promise<ChatSession | null> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: userId,
      title,
      mood: 'neutral',
      anger_level: 50,
      stress_level: 50,
    })
    .select('*')
    .single()

  if (error) {
    console.error('Error creating chat session:', error)
    return null
  }

  return data
}

export async function renameSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  newTitle: string
): Promise<boolean> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ title: newTitle, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId)

  return !error
}

export async function deleteSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId)

  return !error
}

export async function getSessionMessages(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('chat_session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching session messages:', error)
    return []
  }

  return data || []
}

export async function updateSessionSummary(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  summary: string,
  mood: string,
  angerLevel: number,
  stressLevel: number
): Promise<boolean> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({
      summary,
      mood,
      anger_level: angerLevel,
      stress_level: stressLevel,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', userId)

  return !error
}
