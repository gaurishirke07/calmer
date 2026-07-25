import { SupabaseClient } from '@supabase/supabase-js'
import { ChatSession, CategorizedSessions, ChatMessage } from '@/lib/types'

// Chat history now lives in the unified schema: a `session` row (carrying
// title/summary/mood) is one conversation, and its `therapist_convo` rows are
// the messages. Only sessions that have at least one chat message appear in
// the chat sidebar, so vent-only rage-room sessions don't clutter it. Ownership
// is enforced by RLS via session.user_id.

export async function getUserSessionsGrouped(
  supabase: SupabaseClient,
  userId: string
): Promise<CategorizedSessions> {
  const { data, error } = await supabase
    .from('session')
    .select('id, title, mood, created_at, updated_at, therapist_convo(count)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  const empty: CategorizedSessions = { today: [], yesterday: [], previous7Days: [], older: [] }
  if (error) {
    console.error('Error fetching sessions:', error)
    return empty
  }

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
  const sevenDaysAgoStart = todayStart - 7 * 24 * 60 * 60 * 1000

  const categorized: CategorizedSessions = { today: [], yesterday: [], previous7Days: [], older: [] }

  type Row = {
    id: string
    title: string | null
    mood: string | null
    created_at: string
    updated_at: string
    therapist_convo?: { count: number }[]
  }

  for (const row of (data ?? []) as Row[]) {
    const messageCount = row.therapist_convo?.[0]?.count ?? 0
    if (messageCount === 0) continue // only conversations with chat show here

    const session: ChatSession = {
      id: row.id,
      user_id: userId,
      title: row.title || 'New Conversation',
      mood: (row.mood as ChatSession['mood']) || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
      chat_messages: [{ count: messageCount }],
    }

    const t = new Date(row.updated_at || row.created_at).getTime()
    if (t >= todayStart) categorized.today.push(session)
    else if (t >= yesterdayStart) categorized.yesterday.push(session)
    else if (t >= sevenDaysAgoStart) categorized.previous7Days.push(session)
    else categorized.older.push(session)
  }

  return categorized
}

export async function createNewSession(
  supabase: SupabaseClient,
  userId: string,
  title: string = 'New Conversation'
): Promise<ChatSession | null> {
  const { data, error } = await supabase
    .from('session')
    .insert({ user_id: userId, status: 'active', title })
    .select('id, title, mood, created_at, updated_at')
    .single()

  if (error) {
    console.error('Error creating session:', error)
    return null
  }
  return data as ChatSession
}

export async function renameSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  newTitle: string
): Promise<boolean> {
  const { error } = await supabase
    .from('session')
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
  // Cascades to therapist_convo / emotional_state / venting_interaction.
  const { error } = await supabase
    .from('session')
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
    .from('therapist_convo')
    .select('id, sender, msg_text, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching session messages:', error)
    return []
  }

  type Row = { id: string; sender: 'user' | 'assistant'; msg_text: string; created_at: string }
  return (data as Row[] ?? []).map((m) => ({
    id: m.id,
    chat_session_id: sessionId,
    user_id: userId,
    role: m.sender,
    content: m.msg_text,
    created_at: m.created_at,
  }))
}

export async function updateSessionSummary(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  summary: string,
  mood: string
): Promise<boolean> {
  const { error } = await supabase
    .from('session')
    .update({ summary, mood, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId)

  return !error
}
