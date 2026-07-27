/**
 * Generates the data behind Fig. 3 (readiness trajectory + signal composition).
 *
 * Drives the REAL /api/biometric route and the REAL fusion code — it does not
 * reimplement any scoring. Runs a session twice:
 *   A. software-only  — venting telemetry, no sensor readings
 *   B. sensing attached — the same venting profile plus a calming biometric trace
 * so the two `signals_used` sets can be compared directly.
 *
 * Requires: dev server on :3000, .env.local populated, migrations 001-010 run.
 * Usage:  node scripts/generate-fig3.js [USER_UUID] [--interval MS]
 *
 * --interval controls wall-clock spacing between snapshots (default 150ms).
 * At the default the run finishes in seconds, but `sessionContext` barely
 * accrues, so the trajectory is driven almost entirely by the venting and
 * biometric terms. For a figure with a truthful time axis use --interval 7500,
 * which spreads ten snapshots across roughly the 120s venting cap.
 *
 * Output: fig3-data.json  (feed to your plotting tool of choice)
 */
const fs = require('fs')
const path = require('path')

const env = {}
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
  .replace(/\r\n/g, '\n')
  .split('\n')
  .forEach((l) => {
    l = l.trim()
    if (!l || l.startsWith('#') || !l.includes('=')) return
    const i = l.indexOf('=')
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim()
  })

const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
const SECRET = env.HARDWARE_INGEST_SECRET
const API = process.env.CALMER_API_URL || 'http://localhost:3000'
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

// A session that vents hard, then settles — the arc the paper describes.
const VENT_PROFILE = [90, 88, 92, 85, 80, 70, 55, 40, 25, 12, 6, 0, 0, 0, 0, 0]
// Grip and heart rate falling in step with it.
const BIO_PROFILE = [
  { grip: 970, hr: 131, ibi: 458 }, { grip: 940, hr: 126, ibi: 476 },
  { grip: 880, hr: 119, ibi: 504 }, { grip: 760, hr: 111, ibi: 541 },
  { grip: 610, hr: 102, ibi: 588 }, { grip: 430, hr: 94, ibi: 638 },
  { grip: 260, hr: 86, ibi: 698 }, { grip: 120, hr: 78, ibi: 769 },
  { grip: 55, hr: 72, ibi: 833 }, { grip: 20, hr: 68, ibi: 882 },
]

const argv = process.argv.slice(2)
const ivIdx = argv.indexOf('--interval')
const INTERVAL = ivIdx !== -1 ? parseInt(argv[ivIdx + 1], 10) : 150
const USER_ID = argv[0] && !argv[0].startsWith('--') ? argv[0] : null

async function newSession(label) {
  let userId = USER_ID
  if (!userId) {
    const r = await fetch(U + '/rest/v1/session?select=user_id&limit=1', { headers: H })
    const rows = await r.json()
    if (!rows.length) throw new Error('No existing session to borrow a user_id from. Pass one: node scripts/generate-fig3.js <USER_UUID>')
    userId = rows[0].user_id
  }
  const r = await fetch(U + '/rest/v1/session', {
    method: 'POST',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, status: 'active', mrt_condition: 'readiness', title: label }),
  })
  return (await r.json())[0].id
}

async function ventTick(sid, intensity) {
  if (intensity <= 0) return
  await fetch(U + '/rest/v1/venting_interaction', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ session_id: sid, input_type: 'tap', intensity_score: intensity, target_label: 'fig3' }),
  })
}

async function bioTick(sid, r) {
  const res = await fetch(API + '/api/biometric', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hardware-secret': SECRET },
    body: JSON.stringify({ session_id: sid, grip_pressure: r.grip, heart_rate: r.hr, ibi: r.ibi }),
  })
  if (!res.ok) throw new Error('biometric ingest failed: ' + res.status + ' ' + (await res.text()))
  return res.json()
}

async function trajectory(sid) {
  const r = await fetch(
    U + '/rest/v1/emotional_state?session_id=eq.' + sid +
      '&select=readiness_score,stress_level,signals_used,corroborated,source,recorded_at&order=recorded_at.asc',
    { headers: H },
  )
  return r.json()
}

;(async () => {
  const out = {}

  // ── B. sensing attached ────────────────────────────────────────────────────
  const withHw = await newSession('fig3 sensing attached')
  for (let i = 0; i < VENT_PROFILE.length; i++) {
    await ventTick(withHw, VENT_PROFILE[i])
    if (i < BIO_PROFILE.length) await bioTick(withHw, BIO_PROFILE[i])
    await new Promise((r) => setTimeout(r, INTERVAL))
  }
  out.sensingAttached = { session: withHw, points: await trajectory(withHw) }

  console.log('sensing attached :', out.sensingAttached.points.length, 'snapshots ->', withHw)
  console.log('  final readiness:', out.sensingAttached.points.at(-1)?.readiness_score)
  console.log('  signals        :', JSON.stringify(out.sensingAttached.points.at(-1)?.signals_used))
  console.log('  corroborated   :', out.sensingAttached.points.at(-1)?.corroborated)

  fs.writeFileSync(path.join(__dirname, '..', 'fig3-data.json'), JSON.stringify(out, null, 2))
  console.log('\nwrote fig3-data.json')
  console.log('NOTE: the software-only arm comes from playing a real rage-room session')
  console.log('      in the browser; its emotional_state rows carry signals_used')
  console.log('      ["ventingTrend","sessionContext"] with no biometricTrend.')
})()
