// CALMER Biometric Simulator
// Sends a sequence of FAKE grip/heart-rate readings to /api/biometric, so you
// can test the entire software chain WITHOUT a physical Arduino:
//
//   simulate.js  ->  /api/biometric  ->  biometric_reading + emotional_state
//                                        ->  readiness fusion (biometricTrend)
//
// It simulates a venting session that calms down (grip + HR fall over time), so
// the biometric stress trend should visibly decline across the readings.
//
// Run FIRST, before touching hardware — it isolates "is my software correct"
// from "is my wiring correct".
//
// Usage:
//   node simulate.js --session <SESSION_UUID> [--count 8] [--interval 1500]
//
// Config (same as the bridge — put in hardware/.env or pass as env vars):
//   CALMER_API_URL          e.g. http://localhost:3000
//   CALMER_HARDWARE_SECRET  must equal HARDWARE_INGEST_SECRET in the app's .env.local

try { require('dotenv').config() } catch { /* dotenv optional */ }

function getArg(flag, fallback) {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : fallback
}

const SESSION_ID = getArg('--session', process.env.CALMER_SESSION_ID)
const COUNT = parseInt(getArg('--count', '8'), 10)
const INTERVAL = parseInt(getArg('--interval', '1500'), 10)
const API_URL = process.env.CALMER_API_URL || 'http://localhost:3000'
const SECRET = process.env.CALMER_HARDWARE_SECRET

if (!SESSION_ID || !SECRET) {
  console.error(
    'Missing config. Need --session <UUID> and CALMER_HARDWARE_SECRET.\n' +
      'Copy hardware/.env.example -> hardware/.env and fill it in, or pass them as env vars.',
  )
  process.exit(1)
}

// Simulate calming: firm grip -> relaxed, elevated HR -> resting, over COUNT steps.
function reading(i) {
  const t = COUNT > 1 ? i / (COUNT - 1) : 1 // 0 -> 1
  const grip = Math.round(1000 - t * 950) // 1000 (firm) -> ~50 (relaxed)
  const hr = Math.round(125 - t * 50) // 125 (elevated) -> 75 (resting)
  // IBI ~ 60000/hr, with beat-to-beat variability that GROWS as the user calms
  // (higher HRV / RMSSD when relaxed) — so the server-side RMSSD should rise.
  const baseIbi = Math.round(60000 / hr)
  const jitter = Math.round((5 + t * 45) * (Math.random() * 2 - 1))
  const ibi = baseIbi + jitter
  return { session_id: SESSION_ID, heart_rate: hr, grip_pressure: grip, ibi }
}

async function send(payload) {
  try {
    const res = await fetch(`${API_URL}/api/biometric`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hardware-secret': SECRET },
      body: JSON.stringify(payload),
    })
    const body = await res.text()
    console.log(
      res.ok ? '[sim] ok  ' : `[sim] FAILED ${res.status} `,
      `grip=${payload.grip_pressure} bpm=${payload.heart_rate} ibi=${payload.ibi}`,
      '->',
      body.slice(0, 160),
    )
  } catch (err) {
    console.error('[sim] network error (is the app running at ' + API_URL + '?):', err.message)
  }
}

;(async () => {
  console.log(`[sim] sending ${COUNT} readings to ${API_URL}/api/biometric for session ${SESSION_ID}`)
  for (let i = 0; i < COUNT; i++) {
    await send(reading(i))
    if (i < COUNT - 1) await new Promise((r) => setTimeout(r, INTERVAL))
  }
  console.log('[sim] done. Check biometric_reading + emotional_state rows for this session.')
})()
