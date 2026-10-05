import { SupabaseClient } from '@supabase/supabase-js'
import { MoodAnalyticsData, EmotionType } from '@/lib/types'
import { dayKey, shiftDay, weekdayOf } from '@/lib/time'

// Analytics read the unified schema. Ownership is enforced by RLS (the
// authenticated server client only sees this user's rows), so no explicit
// user_id filter is needed on emotional_state / therapist_convo.
//
// Honesty rules (audit C8/U11, 2026-10-05):
// - Stress is read from where each session ENDED. The game's first readings
//   are always 'high' (the user is at their venting peak), so averaging every
//   snapshot measured "how much you played", not how stressed you were.
// - Placeholder snapshots (no signals at all, scored 0.5 'moderate') are not data.
// - Days are Asia/Kolkata calendar days; a day without data is null (a gap),
//   never 0.
// - Everything covers a fixed window (WINDOW_DAYS) and is read in pages, so
//   the 1000-row response cap can't silently truncate it.

export const WINDOW_DAYS = 28
const PAGE = 1000

const stressToScore = (level: string | null): number | null =>
  level === 'high' ? 85 : level === 'moderate' ? 55 : level === 'low' ? 25 : null

// sentiment -1 (distressed) .. +1 (calm) -> negative mood 0..100. Only
// genuinely negative sentiment counts; neutral/positive read ~0.
const sentimentToNegativeMood = (s: number): number => Math.round(Math.max(0, -s) * 100)

export type StateRow = {
  session_id: string
  sentiment_score: number | null
  stress_level: string | null
  signals_used: string[] | null
  recorded_at: string
}

const mean = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

/** Pure aggregation (unit-tested): rows in, dashboard numbers out. */
export function summariseMood(input: {
  states: StateRow[] // within the window, any order
  emotionLabels: string[] // user chat messages the classifier labelled, within the window
  recentTriggers: string[] // newest first
  chatSessionCount: number
  currentMood: string | null
  now: Date
}): MoodAnalyticsData {
  const today = dayKey(input.now)

  // Each session's last real snapshot with a stress level = where it ended.
  const ended = new Map<string, { day: string; t: number; stress: number }>()
  const negativeByDay = new Map<string, number[]>()
  for (const r of input.states) {
    const t = Date.parse(r.recorded_at)
    if (r.sentiment_score != null && Number.isFinite(r.sentiment_score)) {
      const d = dayKey(t)
      negativeByDay.set(d, [...(negativeByDay.get(d) ?? []), sentimentToNegativeMood(r.sentiment_score)])
    }
    const stress = stressToScore(r.stress_level)
    const placeholder = !r.signals_used || r.signals_used.length === 0
    if (stress === null || placeholder) continue
    const prev = ended.get(r.session_id)
    if (!prev || t > prev.t) ended.set(r.session_id, { day: dayKey(t), t, stress })
  }
  const stressByDay = new Map<string, number[]>()
  for (const e of ended.values()) stressByDay.set(e.day, [...(stressByDay.get(e.day) ?? []), e.stress])

  const over = (days: string[]) => ({
    negativeMood: mean(days.flatMap((d) => negativeByDay.get(d) ?? [])),
    stress: mean(days.flatMap((d) => stressByDay.get(d) ?? [])),
  })
  const lastNDays = (n: number, endOffset = 0) => Array.from({ length: n }, (_, i) => shiftDay(today, endOffset + n - 1 - i))

  const weeklyMoodTrend = lastNDays(7).map((d) => ({ day: weekdayOf(d), date: d, ...over([d]) }))
  const monthlyMoodTrend = [3, 2, 1, 0].map((w) => ({ week: w === 0 ? 'This week' : `${w} wk ago`, ...over(lastNDays(7, w * 7)) }))
  const windowStats = over(lastNDays(WINDOW_DAYS))

  // Positive = sessions ended calmer in the last fortnight than the one before.
  const recent = over(lastNDays(14)).stress
  const earlier = over(lastNDays(14, 14)).stress
  const stressChange = recent !== null && earlier !== null ? earlier - recent : null

  const counts: Record<string, number> = {}
  for (const l of input.emotionLabels) counts[l.toLowerCase()] = (counts[l.toLowerCase()] ?? 0) + 1
  const total = input.emotionLabels.length
  const emotionDistribution = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([emotion, count]) => ({
      emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
      count,
      percentage: total ? Math.round((count / total) * 100) : 0,
    }))

  return {
    windowDays: WINDOW_DAYS,
    weeklyMoodTrend,
    monthlyMoodTrend,
    emotionDistribution,
    recentTriggers: input.recentTriggers,
    totalSessions: input.chatSessionCount,
    averageNegativeMood: windowStats.negativeMood,
    averageStress: windowStats.stress,
    stressChange,
    currentMood: (input.currentMood as EmotionType) || 'neutral',
    latestTrigger: input.recentTriggers[0] ?? null,
  }
}

/** All rows of a query, page by page (PostgREST caps one response at 1000). */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) {
      console.error('[analytics] query failed:', error.message)
      return rows
    }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

export async function getUserMoodAnalytics(supabase: SupabaseClient, userId: string): Promise<MoodAnalyticsData> {
  const now = new Date()
  // A day of slack before the window so IST day edges are always covered.
  const since = new Date(now.getTime() - (WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString()

  const [sessionsRes, states, labels, triggersRes] = await Promise.all([
    supabase
      .from('session')
      .select('id, mood, updated_at, therapist_convo(count)')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    readAll<StateRow>((from, to) =>
      supabase
        .from('emotional_state')
        .select('session_id, sentiment_score, stress_level, signals_used, recorded_at')
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    // The user's own messages that the classifier actually labelled (assistant
    // rows have no label and used to be counted as 'neutral').
    readAll<{ emotion_label: string }>((from, to) =>
      supabase
        .from('therapist_convo')
        .select('emotion_label')
        .eq('sender', 'user')
        .not('emotion_label', 'is', null)
        .gte('created_at', since)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    // Memories are de-duplicated, so a "most common" count is meaningless: show
    // the most recent ones instead.
    supabase
      .from('user_memories')
      .select('memory_text')
      .eq('user_id', userId)
      .eq('category', 'trigger')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  type SessionRow = { id: string; mood: string | null; updated_at: string; therapist_convo?: { count: number }[] }
  const chatSessions = ((sessionsRes.data ?? []) as SessionRow[]).filter((s) => (s.therapist_convo?.[0]?.count ?? 0) > 0)

  return summariseMood({
    states,
    emotionLabels: labels.map((l) => l.emotion_label),
    recentTriggers: ((triggersRes.data ?? []) as { memory_text: string }[]).map((t) => t.memory_text.slice(0, 60)),
    chatSessionCount: chatSessions.length,
    currentMood: chatSessions[0]?.mood ?? null,
    now,
  })
}
