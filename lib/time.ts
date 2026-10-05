// Calendar days for a study run in India. The server runs in UTC (Vercel), so
// "today", day buckets and weekdays must be computed in this zone explicitly;
// before, an IST evening session landed on the next UTC day, or the previous.
export const APP_TIME_ZONE = 'Asia/Kolkata'

const DAY_MS = 24 * 60 * 60 * 1000

/** YYYY-MM-DD of an instant, in the app's time zone. */
export function dayKey(at: string | number | Date): string {
  return new Date(at).toLocaleDateString('en-CA', { timeZone: APP_TIME_ZONE })
}

/** The day key `n` calendar days before `key` (DST-free: IST has none). */
export function shiftDay(key: string, n: number): string {
  const t = Date.parse(`${key}T12:00:00Z`) - n * DAY_MS
  return new Date(t).toISOString().slice(0, 10)
}

/** Short weekday ("Mon") for a day key. */
export function weekdayOf(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}

/** Whole calendar days from `earlier` to `later` (both day keys). */
export function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / DAY_MS)
}
