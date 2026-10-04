import { describe, expect, it } from 'vitest'
import {
  digestSummary,
  inviteMessage,
  mailtoLink,
  supportRequestMessage,
  whatsappLink,
  type SupporterDay,
} from './supporter'

const day = (i: number, over: Partial<SupporterDay> = {}): SupporterDay => ({
  day: `2026-10-${String(i + 1).padStart(2, '0')}`,
  sessions: 0,
  calm: null,
  highStress: false,
  safetyConcern: false,
  supportRequests: 0,
  ...over,
})
const fortnight = (fn: (i: number) => Partial<SupporterDay>) => Array.from({ length: 14 }, (_, i) => day(i, fn(i)))

describe('digestSummary', () => {
  it('reads "better" when the last week is clearly calmer than the one before', () => {
    const d = digestSummary({ days: fortnight((i) => ({ sessions: 1, calm: i < 7 ? 0.4 : 0.7 })), lastActive: null, lastSupportRequest: null })
    expect(d.trend).toBe('better')
    expect(d.totalSessions).toBe(14)
    expect(d.activeDays).toBe(14)
  })

  it('reads "worse" when calm dropped', () => {
    const d = digestSummary({ days: fortnight((i) => ({ calm: i < 7 ? 0.8 : 0.5 })), lastActive: null, lastSupportRequest: null })
    expect(d.trend).toBe('worse')
  })

  it('treats a small drift as steady, not as news', () => {
    const d = digestSummary({ days: fortnight((i) => ({ calm: i < 7 ? 0.6 : 0.65 })), lastActive: null, lastSupportRequest: null })
    expect(d.trend).toBe('steady')
  })

  it('says unknown without data in both weeks', () => {
    const d = digestSummary({ days: fortnight((i) => ({ calm: i < 7 ? null : 0.9 })), lastActive: null, lastSupportRequest: null })
    expect(d.trend).toBe('unknown')
    expect(d.calmRecent).toBeCloseTo(0.9)
    expect(d.calmPrevious).toBeNull()
  })

  it('lists flagged days by date only', () => {
    const d = digestSummary({
      days: fortnight((i) => ({ safetyConcern: i === 3, highStress: i === 3 || i === 9, supportRequests: i === 12 ? 2 : 0 })),
      lastActive: null,
      lastSupportRequest: null,
    })
    expect(d.safetyConcernDays).toEqual(['2026-10-04'])
    expect(d.highStressDays).toEqual(['2026-10-04', '2026-10-10'])
    expect(d.supportRequestDays).toEqual(['2026-10-13'])
  })

  it('copes with an empty window', () => {
    const d = digestSummary({ days: [], lastActive: null, lastSupportRequest: null })
    expect(d.trend).toBe('unknown')
    expect(d.totalSessions).toBe(0)
  })
})

describe('messages and links', () => {
  it('names the supporter, and falls back when the name is blank', () => {
    expect(supportRequestMessage('Priya')).toMatch(/^Hi Priya,/)
    expect(supportRequestMessage('  ')).toMatch(/^Hi there,/)
  })

  it('tells the invitee what they will and will not see', () => {
    const m = inviteMessage('Priya', 'https://x.test/support/accept?token=abc')
    expect(m).toContain('never what I write')
    expect(m).toContain('https://x.test/support/accept?token=abc')
  })

  it('encodes the text into share links', () => {
    expect(whatsappLink('a b&c')).toBe('https://wa.me/?text=a%20b%26c')
    expect(mailtoLink('p@x.test', 'Hi', 'a b')).toBe('mailto:p@x.test?subject=Hi&body=a%20b')
  })
})
