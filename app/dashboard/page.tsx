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

  // Fetch profile, sessions, analytics
  const [profileResult, gameSessionsResult, chatSessionsResult, analytics] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single(),
    supabase
      .from('game_sessions')
      .select('*')
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
  const gameSessions = gameSessionsResult.data || []
  const chatSessions = chatSessionsResult.data || []

  const totalGameSessions = gameSessions.length
  const totalChatSessions = analytics.totalSessions
  const totalScore = gameSessions.reduce((sum, s) => sum + (s.score || 0), 0)
  const totalDestroyed = gameSessions.reduce((sum, s) => sum + (s.targets_destroyed || 0), 0)
  const avgIntensity = gameSessions.length > 0
    ? Math.round(gameSessions.reduce((sum, s) => sum + (s.intensity_level || 0), 0) / gameSessions.length)
    : 0

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
              totalGameSessions,
              totalChatSessions,
              totalScore,
              totalDestroyed,
              avgIntensity,
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
