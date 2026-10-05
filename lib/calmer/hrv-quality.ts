// Measurement-quality gates for the optical pulse sensor.
//
// The first bench test (2026-08-03, 184 readings from a real board) showed what
// poor sensor contact does: heart rate 46–218 bpm (median 122 while seated),
// beat intervals 252–1876 ms, RMSSD median 341 ms where healthy resting adults
// sit at roughly 20–100 ms, and 58% of successive beats changing by more than
// 20% — missed and doubled beats. Software cannot recover the true heartbeat
// from that; the fix for the signal is contact and placement. What software
// MUST do is stop noise from posing as physiology: before this, a misread
// 218 bpm scored as maximal stress and pulled readiness down.
//
// Two gates, applied wherever readings enter the score or the stored HRV:
//  1. heart rate outside a plausible range for a seated adult is treated as
//     UNAVAILABLE — exactly like a sensor dropout — not as a stress reading;
//  2. HRV (RMSSD) is computed only over beats that are in range AND within 20%
//     of the window's median beat, and only across adjacent accepted pairs, so a
//     dropped beat can't masquerade as variability.

export const HR_MIN_BPM = 40
export const HR_MAX_BPM = 180 // seated use; exercise would need a higher ceiling
export const IBI_MIN_MS = 60000 / HR_MAX_BPM // ≈ 333 ms
export const IBI_MAX_MS = 60000 / HR_MIN_BPM // 1500 ms
export const MAX_BEAT_DEVIATION = 0.2 // from the window median

/** The heart rate if physiologically plausible for a seated adult, else null (unavailable). */
export function plausibleHeartRate(bpm: number | null | undefined): number | null {
  if (bpm === null || bpm === undefined || !Number.isFinite(bpm)) return null
  return bpm >= HR_MIN_BPM && bpm <= HR_MAX_BPM ? bpm : null
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * RMSSD over a window of beat intervals (ms), after rejecting artifacts. Returns
 * null when fewer than two clean successive differences survive — "unknown" is
 * honest; a number built from misdetected beats is not.
 */
export function cleanRmssd(ibis: number[]): { rmssd: number | null; accepted: number; total: number } {
  const total = ibis.length
  const inRange = ibis.map((v) => v >= IBI_MIN_MS && v <= IBI_MAX_MS)
  const rangeVals = ibis.filter((_, i) => inRange[i])
  if (rangeVals.length < 3) return { rmssd: null, accepted: rangeVals.length, total }
  const ref = median(rangeVals)
  const ok = ibis.map((v, i) => inRange[i] && Math.abs(v - ref) / ref <= MAX_BEAT_DEVIATION)
  const diffs: number[] = []
  for (let i = 1; i < ibis.length; i++) if (ok[i] && ok[i - 1]) diffs.push(ibis[i] - ibis[i - 1])
  const accepted = ok.filter(Boolean).length
  if (diffs.length < 2) return { rmssd: null, accepted, total }
  return { rmssd: Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / diffs.length), accepted, total }
}

// ── Consecutive beats across readings ───────────────────────────────────────
// Since 2026-10-06 the firmware reports EVERY beat and the bridge sends all
// beats since its last post as `ibis` (stored per reading, migration 016).
// Before, one beat per ~2 s reached the server, so "successive differences"
// compared beats 2–3 apart and the stored RMSSD was not RMSSD.

export const MAX_BEAT_GAP_MS = 5000 // a longer silence between readings = dropout
export const RMSSD_WINDOW_BEATS = 30 // ~30 s of beats: the usual ultra-short window

export interface BeatRow {
  recorded_at: string
  ibi: number | null
  ibis?: number[] | null
}

/**
 * The most recent run of successive beats, oldest first: the readings' beat
 * lists joined in time order, cut at the last dropout (a gap longer than
 * MAX_BEAT_GAP_MS) or at a reading without a beat list. Readings from the old
 * bridge carry one beat per ~2 s, which are NOT successive beats, so they
 * never contribute (their RMSSD is unknown, not wrong). `current` is this
 * request's beat list (empty from an old bridge).
 */
export function contiguousBeats(rowsChrono: BeatRow[], current: number[], nowMs: number): number[] {
  if (!current.length) return []
  const segments: number[][] = []
  let prevT = nowMs
  for (let i = rowsChrono.length - 1; i >= 0; i--) {
    const r = rowsChrono[i]
    const t = Date.parse(r.recorded_at)
    if (!Number.isFinite(t) || prevT - t > MAX_BEAT_GAP_MS || !r.ibis?.length) break
    segments.unshift(r.ibis.filter(Number.isFinite))
    prevT = t
  }
  return [...segments.flat(), ...current.filter(Number.isFinite)]
}
