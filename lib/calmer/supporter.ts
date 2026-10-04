// Trusted supporter (docs/TRUSTED-SUPPORTER.md): the shape of what a supporter
// sees, returned by supporter_summary() in migration 014, plus the wording and
// links for the "let them know" messages the user sends themselves.

export interface SupporterDay {
  day: string // YYYY-MM-DD, Asia/Kolkata
  sessions: number
  calm: number | null // mean end-of-session readiness, 0..1
  highStress: boolean
  safetyConcern: boolean // a high-severity safety flag that day (date only)
  supportRequests: number
}

export interface SupporterSummary {
  days: SupporterDay[]
  lastActive: string | null
  lastSupportRequest: string | null
}

export type CalmTrend = 'better' | 'worse' | 'steady' | 'unknown'

// A change in mean calm smaller than this is "steady": readiness is noisy, and
// a supporter shouldn't be alarmed by a few points' drift.
export const TREND_MIN_CHANGE = 0.1

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Plain-language digest of the 14-day window: last 7 days vs the 7 before. */
export function digestSummary(summary: SupporterSummary) {
  const days = summary.days ?? []
  const recent = days.slice(-7)
  const previous = days.slice(-14, -7)
  const calmOf = (ds: SupporterDay[]) => mean(ds.map((d) => d.calm).filter((c): c is number => c !== null))
  const calmRecent = calmOf(recent)
  const calmPrevious = calmOf(previous)

  let trend: CalmTrend = 'unknown'
  if (calmRecent !== null && calmPrevious !== null) {
    const change = calmRecent - calmPrevious
    trend = change >= TREND_MIN_CHANGE ? 'better' : change <= -TREND_MIN_CHANGE ? 'worse' : 'steady'
  }

  return {
    totalSessions: days.reduce((n, d) => n + d.sessions, 0),
    activeDays: days.filter((d) => d.sessions > 0).length,
    calmRecent,
    calmPrevious,
    trend,
    highStressDays: days.filter((d) => d.highStress).map((d) => d.day),
    safetyConcernDays: days.filter((d) => d.safetyConcern).map((d) => d.day),
    supportRequestDays: days.filter((d) => d.supportRequests > 0).map((d) => d.day),
  }
}

/** The message the user sends their supporter (they can edit it before sending). */
export function supportRequestMessage(supporterName: string): string {
  const name = supporterName.trim() || 'there'
  return `Hi ${name}, I'm having a hard time right now and could use some support. Could we talk when you're free?`
}

/** The invite the user sends with the link. */
export function inviteMessage(supporterName: string, link: string): string {
  const name = supporterName.trim() || 'there'
  return (
    `Hi ${name}, I use CALMER to work through stress and anger, and I'd like you to be my trusted person. ` +
    `You'd see how I'm doing overall (never what I write), and I can let you know when I'm struggling. ` +
    `Accept here (sign in with this email address): ${link}`
  )
}

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`

export const mailtoLink = (email: string, subject: string, body: string) =>
  `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
