import { Navigation } from '@/components/navigation'
import { DashboardContent } from '@/components/dashboard/dashboard-content'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserMoodAnalytics } from '@/lib/services/analytics'

export const metadata = {
  title: 'Dashboard - CALMER',
  description: 'View your emotional wellness journey and session history.',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch profile, sessions, analytics. Rage-room history now comes from the
  // unified `session` table (with a venting_interaction count) rather than the
  // dropped legacy game_sessions.
  const [profileResult, ventSessionsResult, chatSessionsResult, analytics] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single(),
    supabase
      .from('session')
      .select('id, created_at, venting_interaction(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('session')
      .select('id, title, mood, created_at, updated_at, therapist_convo(count)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20),
    getUserMoodAnalytics(supabase, user.id),
  ])

  const displayName = profileResult.data?.display_name || user.email?.split('@')[0] || 'Friend'
  // Only sessions where the user actually vented show as "rage room" history —
  // chat-only sessions (0 interactions) belong in Recent Chat Conversations.
  const gameSessions = (ventSessionsResult.data ?? [])
    .map((s: { id: string; created_at: string; venting_interaction?: { count: number }[] }) => ({
      id: s.id,
      created_at: s.created_at,
      interactions: s.venting_interaction?.[0]?.count ?? 0,
    }))
    .filter((s) => s.interactions > 0)
    .slice(0, 10)
  // Only sessions that actually have chat show in "Recent Chat Conversations".
  const chatSessions = ((chatSessionsResult.data ?? []) as {
    id: string
    title: string | null
    mood: string | null
    created_at: string
    therapist_convo?: { count: number }[]
  }[])
    .filter((s) => (s.therapist_convo?.[0]?.count ?? 0) > 0)
    .slice(0, 10)
    .map((s) => ({
      id: s.id,
      created_at: s.created_at,
      title: s.title ?? undefined,
      mood: s.mood ?? undefined,
      chat_messages: s.therapist_convo ?? [],
    }))
  const totalChatSessions = analytics.totalSessions

  return (
    <main className="min-h-screen">
      <Navigation />
      <section className="px-4 pt-24 pb-8">
        <div className="mx-auto max-w-6xl">
          <DashboardContent
            displayName={displayName}
            gameSessions={gameSessions}
            chatSessions={chatSessions}
            stats={{
              totalChatSessions,
              currentMood: analytics.currentMood,
              avgAnger: analytics.averageAnger,
              avgStress: analytics.averageStress,
              mostCommonTrigger: analytics.mostCommonTrigger,
            }}
          />
        </div>
      </section>
    </main>
  )
}
