/**
 * What the biometric quality gates change, measured on the stored readings.
 *
 * 2026-10-04: classifyBiometrics now (a) treats heart rates outside 40–180 bpm
 * as unavailable, like a dropout, and (b) renormalises over whichever channel
 * is present instead of scoring a missing channel as 0 ("perfectly calm"); the
 * biometric route now stores an artifact-rejected RMSSD (lib/calmer/hrv-quality.ts).
 * This replays every stored biometric reading — real board and simulated —
 * through the old and new rules and reports the difference, including at every
 * readiness decision the biometric route made. Read-only.
 *
 * Usage:  node --no-warnings scripts/biometric-quality.mjs
 * Needs:  Node 23.6+, .env.local with the service-role key.
 * Writes: biometric-quality-results.json (gitignored).
 */
import './ts-imports.mjs' // first: lets Node resolve the app's extensionless TS imports
import { biometricProvenance } from './provenance.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (p) => import(pathToFileURL(join(ROOT, p)).href)
const { classifyBiometrics, computeReadinessScore, computeRMSSD } = await load('lib/calmer/readiness.ts')
const { cleanRmssd, plausibleHeartRate } = await load('lib/calmer/hrv-quality.ts')

const env = {}
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=')
  if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
}
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY }
async function all(path) {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}&limit=1000&offset=${offset}`, { headers: H })
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
    const page = await res.json()
    out.push(...page)
    if (page.length < 1000) return out
  }
}

// The PRE-2026-10-04 classifier, kept here only to measure the change.
const clamp01 = (x) => Math.max(0, Math.min(1, x))
function oldStress(hr, gp) {
  let p = 0
  if (gp !== null) p = gp < 100 ? 0 : gp < 650 ? 0.25 : gp < 950 ? 0.6 : 1
  let b = 0
  if (hr !== null) b = hr < 60 ? 0.4 : hr <= 100 ? 0 : hr <= 125 ? 0.5 : clamp01(0.5 + (hr - 125) / 100)
  return clamp01(0.6 * p + 0.4 * b)
}
const cls = (s) => (s === null ? null : s >= 0.66 ? 'high' : s >= 0.33 ? 'moderate' : 'low')
const ms = (s) => new Date(s).getTime()

const [sessions, bio, vent, states] = await Promise.all([
  all('session?select=id,start_time'),
  all('biometric_reading?select=session_id,device_id,heart_rate,grip_pressure,ibi,rmssd,recorded_at&order=recorded_at.asc'),
  all('venting_interaction?select=session_id,input_type,intensity_score,recorded_at&order=recorded_at.asc'),
  all('emotional_state?select=session_id,source,readiness_score,sentiment_score,recorded_at&order=recorded_at.asc'),
])
const group = (rows) => rows.reduce((m, r) => ((m[r.session_id] ??= []).push(r), m), {})
const B = group(bio)
const V = group(vent)
const E = group(states)
const start = Object.fromEntries(sessions.map((s) => [s.id, ms(s.start_time)]))
// Provenance by signature, not just the device tag: board sessions recorded with an
// older bridge carry no device_id (see scripts/provenance.mjs).
const prov = Object.fromEntries(Object.entries(B).map(([sid, rows]) => [sid, biometricProvenance(rows)]))
const sourceOf = (sid) => (prov[sid]?.startsWith('board') ? 'real' : 'simulated')

// ── per-reading: heart-rate gate, stress, RMSSD ──────────────────────────────
const readings = { real: [], simulated: [] }
for (const [sid, rows] of Object.entries(B)) {
  const ibis = []
  for (const r of rows) {
    if (typeof r.ibi === 'number') ibis.push(r.ibi)
    const window = ibis.slice(-10)
    const after = classifyBiometrics(r.heart_rate, r.grip_pressure)
    readings[sourceOf(sid)].push({
      hrPresent: r.heart_rate !== null,
      hrRejected: r.heart_rate !== null && plausibleHeartRate(r.heart_rate) === null,
      before: oldStress(r.heart_rate, r.grip_pressure),
      after: after.stressScore,
      rawRmssd: computeRMSSD(window),
      cleanRmssd: cleanRmssd(window),
    })
  }
}
const q = (xs, p) => {
  const a = xs.filter((x) => x !== null && x !== undefined).sort((x, y) => x - y)
  return a.length ? a[Math.floor(p * (a.length - 1))] : null
}
function summarise(rs) {
  const withHr = rs.filter((r) => r.hrPresent)
  const changed = rs.filter((r) => r.after === null || Math.abs(r.after - r.before) > 1e-9)
  const raw = rs.map((r) => r.rawRmssd)
  const clean = rs.map((r) => r.cleanRmssd.rmssd)
  const acc = rs.filter((r) => r.cleanRmssd.total > 0)
  return {
    readings: rs.length,
    heartRateRejected: rs.filter((r) => r.hrRejected).length,
    heartRateReadings: withHr.length,
    noUsableChannel: rs.filter((r) => r.after === null).length,
    stressChanged: changed.length,
    stressClassChanged: rs.filter((r) => cls(r.before) !== cls(r.after)).length,
    meanAbsStressChange: changed.length
      ? changed.filter((r) => r.after !== null).reduce((a, r) => a + Math.abs(r.after - r.before), 0) / changed.length
      : 0,
    rmssdRaw: { median: q(raw, 0.5), p95: q(raw, 0.95), available: raw.filter((x) => x !== null).length },
    rmssdClean: { median: q(clean, 0.5), p95: q(clean, 0.95), available: clean.filter((x) => x !== null).length },
    beatsAccepted: acc.length ? acc.reduce((a, r) => a + r.cleanRmssd.accepted / r.cleanRmssd.total, 0) / acc.length : null,
  }
}

// ── per-decision: readiness at every biometric-route computation ─────────────
function ventStream(sid) {
  const flushes = (E[sid] ?? []).filter((e) => e.source === 'interaction').map((e) => ms(e.recorded_at))
  const hits = (V[sid] ?? []).filter((v) => v.input_type !== 'idle').map((v) => ({ t: ms(v.recorded_at), v: Number(v.intensity_score) }))
  const s = [...hits]
  let prev = -Infinity
  for (const f of flushes) {
    if (!hits.some((h) => h.t > prev && h.t <= f)) s.push({ t: f, v: 0 })
    prev = f
  }
  return s.sort((a, b) => a.t - b.t)
}
const decisions = { real: [], simulated: [] }
for (const [sid, rows] of Object.entries(E)) {
  const points = rows.filter((e) => e.source === 'biometric')
  if (!points.length) continue
  const stream = ventStream(sid)
  const sent = rows.filter((e) => e.sentiment_score != null).map((e) => ({ t: ms(e.recorded_at), v: Number(e.sentiment_score) }))
  const bioRows = (B[sid] ?? []).map((b) => ({ t: ms(b.recorded_at), hr: b.heart_rate, gp: b.grip_pressure }))
  for (const p of points) {
    const t = ms(p.recorded_at)
    const v = stream.filter((x) => x.t <= t).map((x) => x.v)
    const br = bioRows.filter((x) => x.t <= t).slice(-21)
    const base = {
      ventingIntensities: v.slice(-40),
      ventingSessionPeak: v.length ? Math.max(...v) : undefined,
      sentimentScores: sent.filter((x) => x.t <= t).map((x) => x.v).slice(-10),
      sessionDurationSeconds: (t - start[sid]) / 1000,
    }
    const before = computeReadinessScore({ ...base, biometricStressScores: br.map((x) => oldStress(x.hr, x.gp)) }).readinessScore
    const afterScores = br.map((x) => classifyBiometrics(x.hr, x.gp).stressScore).filter((x) => x !== null)
    const after = computeReadinessScore({ ...base, biometricStressScores: afterScores }).readinessScore
    decisions[sourceOf(sid)].push({ sid, before, after })
  }
}
const decisionSummary = (ds) => ({
  decisions: ds.length,
  verdictFlipped: ds.filter((d) => d.before >= 0.66 !== d.after >= 0.66).length,
  changed: ds.filter((d) => Math.abs(d.before - d.after) > 0.005).length,
  maxAbsChange: ds.length ? Math.max(...ds.map((d) => Math.abs(d.before - d.after))) : 0,
})
const fig3 = decisions.simulated.filter((d) => d.sid.startsWith('98b1bad5'))

const results = {
  generatedAt: new Date().toISOString(),
  readings: { real: summarise(readings.real), simulated: summarise(readings.simulated) },
  decisions: { real: decisionSummary(decisions.real), simulated: decisionSummary(decisions.simulated) },
  fig3SensingArm: decisionSummary(fig3),
  sessionsByProvenance: Object.values(prov).reduce((m, p) => ((m[p] = (m[p] ?? 0) + 1), m), {}),
}
writeFileSync(join(ROOT, 'biometric-quality-results.json'), JSON.stringify(results, null, 2))

const f = (x, d = 0) => (x === null ? 'n/a' : Number(x).toFixed(d))
for (const src of ['real', 'simulated']) {
  const r = results.readings[src]
  const d = results.decisions[src]
  console.log(`\n${src.toUpperCase()} — ${r.readings} readings`)
  console.log(`  heart rate rejected as implausible: ${r.heartRateRejected} of ${r.heartRateReadings}; readings with no usable channel: ${r.noUsableChannel}`)
  console.log(`  stress score changed: ${r.stressChanged} (mean |change| ${f(r.meanAbsStressChange, 3)}); stress class changed: ${r.stressClassChanged}`)
  console.log(`  RMSSD raw   median ${f(r.rmssdRaw.median)} ms, p95 ${f(r.rmssdRaw.p95)} ms (${r.rmssdRaw.available} available)`)
  console.log(`  RMSSD clean median ${f(r.rmssdClean.median)} ms, p95 ${f(r.rmssdClean.p95)} ms (${r.rmssdClean.available} available); beats accepted ${r.beatsAccepted === null ? 'n/a' : (100 * r.beatsAccepted).toFixed(0) + '%'}`)
  console.log(`  readiness at ${d.decisions} biometric decisions: ${d.changed} changed (max |Δ| ${f(d.maxAbsChange, 3)}), handoff verdict flipped at ${d.verdictFlipped}`)
}
console.log(`\nsessions by provenance: ${JSON.stringify(results.sessionsByProvenance)}`)
const g = results.fig3SensingArm
console.log(`\nFig. 3 sensing arm (98b1bad5): ${g.decisions} points, ${g.changed} changed, max |Δ| ${f(g.maxAbsChange, 3)}`)
console.log('\nwrote biometric-quality-results.json')
