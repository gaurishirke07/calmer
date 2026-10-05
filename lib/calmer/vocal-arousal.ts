// Opt-in microphone signal (roadmap C-5). Pure helpers only — capture lives in
// components/calmer/voice-tracker.tsx.
//
// What it measures: VOCAL EFFORT — how loudly the user is speaking above their
// room's noise floor. Not words (no speech recognition) and not emotion:
// loudness is one of the better-established acoustic correlates of arousal, but
// it also depends on mic distance and gain, so the score never uses its
// absolute level. Exactly like venting, the signal is the DECLINE from this
// session's own peak (trendSignal in readiness.ts): shouting sets the peak,
// quieting down from it reads as settling. Silence is a zero sample, like an
// idle venting tick; a session where the user never spoke has no peak, so the
// signal is absent rather than "activated".
//
// Intensities are on a 0..100 scale, like venting intensities, so trendSignal
// measures the RELATIVE decline from the peak (its denominator is max(peak, 1)).

export const VOICE_MARGIN_DB = 10 // speech must clear the noise floor by this much
export const VOICE_RANGE_DB = 40 // floor + margin .. + range maps onto 0..100
// Quietest level treated as a real room. Real rooms through a laptop mic sit far
// above this; anything below is digital silence from the browser.
export const MIN_FLOOR_DB = -100

export function rmsToDb(rms: number): number {
  return 20 * Math.log10(Math.max(rms, 1e-8))
}

/**
 * Running estimate of the room's noise floor in dBFS: drops instantly to a
 * quieter frame, creeps up only slowly, so a long stretch of speech doesn't
 * drag the floor up to speech level (the pauses between phrases reset it).
 */
export function updateNoiseFloor(floor: number | null, db: number): number | null {
  // Digital silence (mic start-up, a muted track) is not the room: leave the
  // floor as it was (still unknown if nothing real has arrived). Letting a
  // -160 dB frame set it made ordinary room noise read as loud speech for
  // ~14 s and then as "settling" — a fabricated calm-down.
  if (db < MIN_FLOOR_DB) return floor
  if (floor === null || db < floor) return db
  return floor + (db - floor) * 0.005
}

/** 0 below the speech threshold, rising linearly with level above it, capped at 100. */
export function vocalIntensity(db: number, floor: number): number {
  const above = db - (floor + VOICE_MARGIN_DB)
  return above <= 0 ? 0 : Math.min(100, (100 * above) / VOICE_RANGE_DB)
}
