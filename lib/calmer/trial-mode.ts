// Trial mode (NEXT_PUBLIC_CALMER_TRIAL_MODE=1): every participant receives the
// same intervention, and the two arms differ ONLY in when the offer appears.
// Hides the opt-in face/voice/gesture toggles, the readiness cues (Calm Meter,
// score-keyed end message) and the trusted-supporter feature, which would add
// a second person the ethics approval doesn't cover. Read at build time.
export const TRIAL_MODE = process.env.NEXT_PUBLIC_CALMER_TRIAL_MODE === '1'
