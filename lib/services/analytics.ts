import { SupabaseClient } from '@supabase/supabase-js'
import { MoodAnalyticsData, EmotionType } from '@/lib/types'

export async function getUserMoodAnalytics(
  supabase: SupabaseClient,
  userId: string
): Promise<MoodAnalyticsData> {
  // game_sessions is intentionally NOT queried here — the previous query
  // fetched it and never used the result (dead). Game telemetry now lives in
  // the unified schema; wiring analytics to it is P6.
  const [chatSessionsRes, messagesRes, moodLogsRes, memoriesRes] = await Promise.all([
    supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('mood_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .eq('category', 'trigger'),
  ])

  const chatSessions = chatSessionsRes.data || []
  const messages = messagesRes.data || []
  const moodLogs = moodLogsRes.data || []
  const triggers = memoriesRes.data || []

  // Emotion distribution
  const emotionCounts: Record<string, number> = {
    anger: 0,
    stress: 0,
    sadness: 0,
    happiness: 0,
    fear: 0,
    neutral: 0,
  }

  messages.forEach((msg) => {
    const emotion = msg.emotion || 'neutral'
    if (emotionCounts[emotion] !== undefined) {
      emotionCounts[emotion] += 1
    }
  })

  const totalMessages = Math.max(1, messages.length)
  const emotionDistribution = Object.entries(emotionCounts).map(([emotion, count]) => ({
    emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
    count,
    percentage: Math.round((count / totalMessages) * 100),
  }))

  // Weekly mood trend (last 7 days)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weeklyMoodTrend: { day: string; anger: number; stress: number; mood: string }[] = []

  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const targetDate = new Date(now)
    targetDate.setDate(now.getDate() - i)
    const dayStr = days[targetDate.getDay()]

    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime()
    const dayEnd = dayStart + 24 * 60 * 60 * 1000

    const dayLogs = moodLogs.filter((log) => {
      const time = new Date(log.created_at).getTime()
      return time >= dayStart && time < dayEnd
    })

    if (dayLogs.length > 0) {
      const avgAnger = Math.round(dayLogs.reduce((sum, l) => sum + l.anger_level, 0) / dayLogs.length)
      const avgStress = Math.round(dayLogs.reduce((sum, l) => sum + l.stress_level, 0) / dayLogs.length)
      weeklyMoodTrend.push({
        day: dayStr,
        anger: avgAnger,
        stress: avgStress,
        mood: dayLogs[0].dominant_emotion || 'neutral',
      })
    } else {
      // No logs this day — record zeros rather than inventing a declining trend.
      weeklyMoodTrend.push({ day: dayStr, anger: 0, stress: 0, mood: 'no data' })
    }
  }

  // Monthly trend (last 4 weeks) — computed from real mood logs, not invented.
  const monthlyMoodTrend: { week: string; anger: number; stress: number }[] = []
  for (let w = 3; w >= 0; w--) {
    const weekEnd = now.getTime() - w * 7 * 24 * 60 * 60 * 1000
    const weekStart = weekEnd - 7 * 24 * 60 * 60 * 1000
    const weekLogs = moodLogs.filter((log) => {
      const t = new Date(log.created_at).getTime()
      return t >= weekStart && t < weekEnd
    })
    monthlyMoodTrend.push({
      week: `Week ${4 - w}`,
      anger: weekLogs.length ? Math.round(weekLogs.reduce((s, l) => s + l.anger_level, 0) / weekLogs.length) : 0,
      stress: weekLogs.length ? Math.round(weekLogs.reduce((s, l) => s + l.stress_level, 0) / weekLogs.length) : 0,
    })
  }

  // Triggers breakdown
  const triggerMap: Record<string, number> = {}
  triggers.forEach((t) => {
    const text = t.memory_text.slice(0, 30)
    triggerMap[text] = (triggerMap[text] || 0) + 1
  })

  const commonTriggers = Object.entries(triggerMap).map(([trigger, count]) => ({
    trigger,
    count,
  }))

  // (No fabricated fallback triggers — commonTriggers reflects real user_memories only.)

  // Calculate averages and stats — honest zeros when there's no data yet.
  const averageAnger = chatSessions.length > 0
    ? Math.round(chatSessions.reduce((acc, s) => acc + (s.anger_level || 0), 0) / chatSessions.length)
    : 0

  const averageStress = chatSessions.length > 0
    ? Math.round(chatSessions.reduce((acc, s) => acc + (s.stress_level || 0), 0) / chatSessions.length)
    : 0

  // Real improvement = the drop in distress from the earliest to the latest
  // session (chatSessions is newest-first). Needs >=2 sessions to mean anything.
  const emotionalImprovement = chatSessions.length >= 2
    ? (() => {
        const newest = chatSessions[0]
        const oldest = chatSessions[chatSessions.length - 1]
        const oldDistress = ((oldest.anger_level || 0) + (oldest.stress_level || 0)) / 2
        const newDistress = ((newest.anger_level || 0) + (newest.stress_level || 0)) / 2
        return Math.max(0, Math.round(oldDistress - newDistress))
      })()
    : 0

  const currentMood: EmotionType = (chatSessions[0]?.mood as EmotionType) || 'neutral'
  const mostCommonTrigger = commonTriggers[0]?.trigger || 'None yet'

  return {
    weeklyMoodTrend,
    monthlyMoodTrend,
    emotionDistribution,
    commonTriggers,
    totalSessions: chatSessions.length,
    averageAnger,
    averageStress,
    emotionalImprovement,
    currentMood,
    mostCommonTrigger,
  }
}
