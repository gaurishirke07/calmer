import { SupabaseClient } from '@supabase/supabase-js'
import { MoodAnalyticsData, EmotionType } from '@/lib/types'

// Analytics read the unified schema. Ownership is enforced by RLS (the
// authenticated server client only sees this user's rows), so no explicit
// user_id filter is needed on emotional_state / therapist_convo.

const stressToScore = (level: string | null): number =>
  level === 'high' ? 85 : level === 'moderate' ? 55 : level === 'low' ? 25 : 0

// sentiment -1 (distressed) .. +1 (calm) -> anger 0..100. Only genuinely
// NEGATIVE sentiment counts as anger; neutral/positive read ~0, so ordinary
// chat doesn't inflate the anger metric.
const sentimentToAnger = (s: number | null): number =>
  s == null ? 0 : Math.round(Math.max(0, -s) * 100)

type StateRow = { sentiment_score: number | null; stress_level: string | null; recorded_at: string }

function avgOver(rows: StateRow[]): { anger: number; stress: number } {
  const withSentiment = rows.filter((r) => r.sentiment_score != null)
  const withStress = rows.filter((r) => r.stress_level != null)
  const anger = withSentiment.length
    ? Math.round(withSentiment.reduce((s, r) => s + sentimentToAnger(r.sentiment_score), 0) / withSentiment.length)
    : 0
  const stress = withStress.length
    ? Math.round(withStress.reduce((s, r) => s + stressToScore(r.stress_level), 0) / withStress.length)
    : 0
  return { anger, stress }
}

export async function getUserMoodAnalytics(
  supabase: SupabaseClient,
  userId: string
): Promise<MoodAnalyticsData> {
  const [sessionsRes, statesRes, convoRes, memoriesRes] = await Promise.all([
    supabase
      .from('session')
      .select('id, mood, updated_at, therapist_convo(count)')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    supabase.from('emotional_state').select('sentiment_score, stress_level, recorded_at').order('recorded_at', { ascending: false }),
    supabase.from('therapist_convo').select('emotion_label'),
    supabase.from('user_memories').select('memory_text').eq('user_id', userId).eq('category', 'trigger'),
  ])

  type SessionRow = { id: string; mood: string | null; updated_at: string; therapist_convo?: { count: number }[] }
  const sessions = (sessionsRes.data ?? []) as SessionRow[]
  const chatSessions = sessions.filter((s) => (s.therapist_convo?.[0]?.count ?? 0) > 0)
  const states = (statesRes.data ?? []) as StateRow[]
  const convo = (convoRes.data ?? []) as { emotion_label: string | null }[]
  const triggers = (memoriesRes.data ?? []) as { memory_text: string }[]

  // ── Emotion distribution (real classifier labels) ───────────────────────
  const emotionCounts: Record<string, number> = {}
  for (const c of convo) {
    const label = (c.emotion_label || 'neutral').toLowerCase()
    emotionCounts[label] = (emotionCounts[label] || 0) + 1
  }
  const totalLabels = Math.max(1, convo.length)
  const emotionDistribution = Object.entries(emotionCounts).map(([emotion, count]) => ({
    emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
    count,
    percentage: Math.round((count / totalLabels) * 100),
  }))

  const now = new Date()
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // ── Weekly trend (last 7 days) — honest zeros for days with no data ─────
  const weeklyMoodTrend: { day: string; anger: number; stress: number; mood: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const target = new Date(now)
    target.setDate(now.getDate() - i)
    const dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
    const dayEnd = dayStart + 24 * 60 * 60 * 1000
    const dayRows = states.filter((r) => {
      const t = new Date(r.recorded_at).getTime()
      return t >= dayStart && t < dayEnd
    })
    const { anger, stress } = avgOver(dayRows)
    weeklyMoodTrend.push({ day: days[target.getDay()], anger, stress, mood: dayRows.length ? 'measured' : 'no data' })
  }

  // ── Monthly trend (last 4 weeks) ────────────────────────────────────────
  const monthlyMoodTrend: { week: string; anger: number; stress: number }[] = []
  for (let w = 3; w >= 0; w--) {
    const weekEnd = now.getTime() - w * 7 * 24 * 60 * 60 * 1000
    const weekStart = weekEnd - 7 * 24 * 60 * 60 * 1000
    const weekRows = states.filter((r) => {
      const t = new Date(r.recorded_at).getTime()
      return t >= weekStart && t < weekEnd
    })
    const { anger, stress } = avgOver(weekRows)
    monthlyMoodTrend.push({ week: `Week ${4 - w}`, anger, stress })
  }

  // ── Triggers (real user_memories only, no fabricated fallback) ──────────
  const triggerMap: Record<string, number> = {}
  for (const t of triggers) {
    const text = t.memory_text.slice(0, 30)
    triggerMap[text] = (triggerMap[text] || 0) + 1
  }
  const commonTriggers = Object.entries(triggerMap).map(([trigger, count]) => ({ trigger, count }))

  // ── Overall stats ───────────────────────────────────────────────────────
  const overall = avgOver(states)

  // Real improvement = drop in stress from the earliest to the latest reading
  // (states are ordered newest-first). Needs >=2 readings to mean anything.
  let emotionalImprovement = 0
  if (states.length >= 2) {
    const newD = stressToScore(states[0].stress_level)
    const oldD = stressToScore(states[states.length - 1].stress_level)
    emotionalImprovement = Math.max(0, Math.round(oldD - newD))
  }

  const currentMood: EmotionType = (chatSessions[0]?.mood as EmotionType) || 'neutral'
  const mostCommonTrigger = commonTriggers[0]?.trigger || 'None yet'

  return {
    weeklyMoodTrend,
    monthlyMoodTrend,
    emotionDistribution,
    commonTriggers,
    totalSessions: chatSessions.length,
    averageAnger: overall.anger,
    averageStress: overall.stress,
    emotionalImprovement,
    currentMood,
    mostCommonTrigger,
  }
}
