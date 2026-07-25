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
      .limit(10),
    supabase
      .from('chat_sessions')
      .select('*, chat_messages(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
    getUserMoodAnalytics(supabase, user.id),
  ])

  const displayName = profileResult.data?.display_name || user.email?.split('@')[0] || 'Friend'
  const gameSessions = (ventSessionsResult.data ?? []).map(
    (s: { id: string; created_at: string; venting_interaction?: { count: number }[] }) => ({
      id: s.id,
      created_at: s.created_at,
      interactions: s.venting_interaction?.[0]?.count ?? 0,
    }),
  )
  const chatSessions = chatSessionsResult.data || []
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
