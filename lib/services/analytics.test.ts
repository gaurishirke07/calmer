import { describe, expect, it } from 'vitest'
import { summariseMood, type StateRow } from './analytics'
import { dayKey, daysBetween, shiftDay, weekdayOf } from '@/lib/time'

describe('calendar days in IST', () => {
  it('puts a late-evening IST session on its IST day, not the UTC one', () => {
    // 23:30 IST on 4 Oct = 18:00 UTC on 4 Oct; 00:30 IST on 5 Oct = 19:00 UTC on 4 Oct
    expect(dayKey('2026-10-04T18:00:00Z')).toBe('2026-10-04')
    expect(dayKey('2026-10-04T19:00:00Z')).toBe('2026-10-05')
  })
  it('steps and names days', () => {
    expect(shiftDay('2026-10-05', 1)).toBe('2026-10-04')
    expect(shiftDay('2026-10-01', 1)).toBe('2026-09-30')
    expect(weekdayOf('2026-10-05')).toBe('Mon')
    expect(daysBetween('2026-10-03', '2026-10-05')).toBe(2)
  })
})

const NOW = new Date('2026-10-05T06:30:00Z') // 12:00 IST, Mon 5 Oct
const row = (session: string, iso: string, stress: string | null, extra: Partial<StateRow> = {}): StateRow => ({
  session_id: session,
  recorded_at: iso,
  stress_level: stress,
  sentiment_score: null,
  signals_used: ['ventingTrend', 'sessionContext'],
  ...extra,
})
const base = { emotionLabels: [], recentTriggers: [], chatSessionCount: 0, currentMood: null, now: NOW }

describe('summariseMood', () => {
  it('reads stress where each session ENDED, not every snapshot', () => {
    // A game session starts 'high' (venting peak) and ends 'low'.
    const states = [
      row('g1', '2026-10-05T04:00:00Z', 'high'),
      row('g1', '2026-10-05T04:00:30Z', 'high'),
      row('g1', '2026-10-05T04:01:30Z', 'low'),
    ]
    const r = summariseMood({ ...base, states })
    expect(r.averageStress).toBe(25) // low, not the 65 that averaging all three gave
  })

  it('ignores placeholder snapshots with no signals', () => {
    const states = [row('s', '2026-10-05T04:00:00Z', 'low'), row('s', '2026-10-05T04:05:00Z', 'moderate', { signals_used: [] })]
    expect(summariseMood({ ...base, states }).averageStress).toBe(25)
  })

  it('shows days without data as gaps (null), not 0', () => {
    const r = summariseMood({ ...base, states: [row('s', '2026-10-05T04:00:00Z', 'low')] })
    expect(r.weeklyMoodTrend).toHaveLength(7)
    expect(r.weeklyMoodTrend[6]).toMatchObject({ date: '2026-10-05', day: 'Mon', stress: 25 })
    expect(r.weeklyMoodTrend[0].stress).toBeNull()
    expect(r.weeklyMoodTrend[0].negativeMood).toBeNull()
  })

  it('reports getting worse as well as better', () => {
    const calmerBefore = [row('a', '2026-09-15T06:00:00Z', 'low'), row('b', '2026-10-03T06:00:00Z', 'high')]
    expect(summariseMood({ ...base, states: calmerBefore }).stressChange).toBe(25 - 85) // -60: more stressed now
    const calmerNow = [row('a', '2026-09-15T06:00:00Z', 'high'), row('b', '2026-10-03T06:00:00Z', 'low')]
    expect(summariseMood({ ...base, states: calmerNow }).stressChange).toBe(60)
    expect(summariseMood({ ...base, states: [row('b', '2026-10-03T06:00:00Z', 'low')] }).stressChange).toBeNull()
  })

  it('averages negative mood from chat sentiment only', () => {
    const states = [
      row('c', '2026-10-05T04:00:00Z', null, { sentiment_score: -0.6 }),
      row('c', '2026-10-05T04:01:00Z', null, { sentiment_score: 0.4 }),
    ]
    const r = summariseMood({ ...base, states })
    expect(r.averageNegativeMood).toBe(30) // (60 + 0) / 2
    expect(r.averageStress).toBeNull()
  })

  it('ranks emotions and reports the latest trigger', () => {
    const r = summariseMood({ ...base, states: [], emotionLabels: ['anger', 'anger', 'sadness'], recentTriggers: ['exams', 'traffic'] })
    expect(r.emotionDistribution[0]).toEqual({ emotion: 'Anger', count: 2, percentage: 67 })
    expect(r.latestTrigger).toBe('exams')
    expect(summariseMood({ ...base, states: [] }).latestTrigger).toBeNull()
  })
})
