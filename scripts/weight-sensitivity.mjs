/**
 * Weight-sensitivity + ablation study for the readiness score (roadmap A1).
 *
 * The four fusion weights (0.35 / 0.30 / 0.20 / 0.15) are priors ordered by how
 * directly each signal bears on "is this episode subsiding?" — not fitted
 * values. The paper argues that because the fusion renormalises, it is the
 * ORDER of the weights, not their magnitudes, that decides the outcome when the
 * signals disagree. This script tests that claim on every decision point the
 * live system has recorded. Read-only: it writes nothing to the database.
 *
 * Method — all scoring goes through the production code in lib/calmer/readiness.ts:
 *  1. Every stored emotional_state row is a decision point: a moment the live
 *     system computed readiness.
 *  2. Its inputs are rebuilt from the raw tables exactly as the writer of that
 *     row builds them today:
 *       game flush    venting window (40) + session peak + elapsed time only
 *       biometric     + last 21 readings (20 prior + current) + last 10 sentiments
 *       chat          + last 10 readings + sentiment history incl. this message
 *     Venting histories include an idle zero for every 3 s game flush with no
 *     hit — what migration 011 now persists — so older sessions are replayed as
 *     today's system would score them.
 *  3. The same inputs are re-fused under other weights: one-at-a-time ±0.05 and
 *     ±0.10 perturbations (renormalised), equal weights, and N random vectors
 *     that KEEP the prior order (venting > biometric > sentiment > time) plus N
 *     that BREAK it, drawn from the same magnitude distribution (a Dirichlet
 *     draw sorted, then assigned in prior order vs a shuffled order).
 *  4. Ablation: each signal removed in turn wherever it was present.
 *
 * Metrics: agreement of the handoff verdict (readiness >= 0.66) with the
 * prior-weight verdict, mean |delta readiness|, and for game sessions the shift
 * in when the sustained-calm handoff rule first fires. Reported over
 * WEIGHT-SENSITIVE points (>= 2 signals present, so weights can matter at all)
 * and CONTESTED points (present signals on both sides of the threshold) — the
 * only places where the ordering argument is actually tested.
 *
 * Usage:  node --no-warnings scripts/weight-sensitivity.mjs [--samples 1000] [--seed 7]
 * Needs:  Node 23.6+ (imports the TypeScript module directly via type stripping)
 *         and .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Output: weight-sensitivity-data.json  ->  python scripts/plot-weight-sensitivity.py
 */
import './ts-imports.mjs' // first: lets Node resolve the app's extensionless TS imports
import { biometricProvenance } from './provenance.mjs'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { computeReadinessScore, classifyBiometrics, shouldOfferHandoff, NOMINAL_WEIGHTS } = await import(
  pathToFileURL(join(ROOT, 'lib/calmer/readiness.ts')).href
)

const THRESHOLD = 0.66 // the game's CALM_THRESHOLD
// The four PUBLISHED signals. The opt-in webcam signal (facialAffect) never
// appears in recorded data; it rides along at its prior so every weighting is
// complete, and is never perturbed.
const KEYS = ['ventingTrend', 'biometricTrend', 'sentiment', 'sessionContext']
const OPT_IN = { facialAffect: NOMINAL_WEIGHTS.facialAffect, voiceTrend: NOMINAL_WEIGHTS.voiceTrend }
const SUBSTANTIVE = new Set(KEYS.slice(0, 3))

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name)
  return i > -1 ? Number(process.argv[i + 1]) : dflt
}
const SAMPLES = arg('samples', 1000)
const SEED = arg('seed', 7)

// ── data ─────────────────────────────────────────────────────────────────────
const env = {}
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=')
  if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
}
const BASE = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!BASE || !KEY) throw new Error('.env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY }

// PostgREST caps a response at 1000 rows, so page through.
async function all(path) {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${BASE}/rest/v1/${path}&limit=1000&offset=${offset}`, { headers: H })
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`)
    const page = await res.json()
    out.push(...page)
    if (page.length < 1000) return out
  }
}

const [sessions, ventRows, bioRows, stateRows] = await Promise.all([
  all('session?select=id,start_time,mrt_condition&order=start_time.asc,id.asc'),
  all('venting_interaction?select=session_id,input_type,intensity_score,recorded_at&order=recorded_at.asc,id.asc'),
  all('biometric_reading?select=session_id,device_id,heart_rate,grip_pressure,recorded_at&order=recorded_at.asc,id.asc'),
  all('emotional_state?select=session_id,source,readiness_score,sentiment_score,signals_used,recorded_at&order=recorded_at.asc,id.asc'),
])
const bySession = (rows) => rows.reduce((m, r) => ((m[r.session_id] ??= []).push(r), m), {})
const V = bySession(ventRows)
const B = bySession(bioRows)
const E = bySession(stateRows)
const ms = (s) => new Date(s).getTime()

// ── replay: rebuild each decision point's inputs ─────────────────────────────
function replay(s) {
  const start = ms(s.start_time)
  const states = E[s.id] ?? []
  const flushes = states.filter((e) => e.source === 'interaction').map((e) => ms(e.recorded_at))
  const hits = (V[s.id] ?? [])
    .filter((v) => v.input_type !== 'idle')
    .map((v) => ({ t: ms(v.recorded_at), v: Number(v.intensity_score) }))
  // Hits at their own time, plus an idle zero at every game flush that had no
  // hit since the previous one (the game's rule; what migration 011 persists).
  const stream = [...hits]
  let prev = -Infinity
  for (const f of flushes) {
    if (!hits.some((h) => h.t > prev && h.t <= f)) stream.push({ t: f, v: 0 })
    prev = f
  }
  stream.sort((a, b) => a.t - b.t)
  const bio = (B[s.id] ?? []).map((b) => ({
    t: ms(b.recorded_at),
    v: classifyBiometrics(b.heart_rate, b.grip_pressure).stressScore,
  })).filter((x) => x.v !== null) // no usable channel = no evidence
  const sent = states.filter((e) => e.sentiment_score != null).map((e) => ({ t: ms(e.recorded_at), v: Number(e.sentiment_score) }))
  const upTo = (xs, t, n) => {
    const a = xs.filter((x) => x.t <= t).map((x) => x.v)
    return n ? a.slice(-n) : a
  }

  return states.map((e) => {
    const t = ms(e.recorded_at)
    const kind = e.source === 'interaction' ? 'game' : e.source === 'biometric' ? 'biometric' : 'chat'
    const ventAll = upTo(stream, t)
    const inputs = {
      ventingIntensities: ventAll.slice(-40),
      ventingSessionPeak: ventAll.length ? Math.max(...ventAll) : undefined,
      sessionDurationSeconds: (t - start) / 1000,
    }
    // Game rows fuse the sensor only since 2026-10-04 (and only when one is
    // connected); follow what each row recorded so older rows replay exactly.
    if (kind !== 'game' || (e.signals_used ?? []).includes('biometricTrend')) {
      const b = upTo(bio, t, kind === 'biometric' ? 21 : 10)
      if (b.length) inputs.biometricStressScores = b
    }
    if (kind !== 'game') {
      const se = upTo(sent, t, kind === 'biometric' ? 10 : 11)
      if (se.length) inputs.sentimentScores = se
    }
    return { session: s.id, t, kind, stored: Number(e.readiness_score), recordedAt: e.recorded_at, inputs }
  })
}

const points = sessions.flatMap(replay)
const score = (inputs, w) => computeReadinessScore(inputs, w).readinessScore
for (const p of points) {
  const r = computeReadinessScore(p.inputs)
  p.nominal = r.readinessScore
  p.active = r.contributions.filter((c) => c.active)
  p.values = Object.fromEntries(r.contributions.map((c) => [c.key, c.value]))
  p.sensitive = p.active.length >= 2 && p.active.some((c) => SUBSTANTIVE.has(c.key))
  p.contested =
    p.sensitive && p.active.some((c) => c.value >= THRESHOLD) && p.active.some((c) => c.value < THRESHOLD)
}
const sensitive = points.filter((p) => p.sensitive)
const contested = points.filter((p) => p.contested)

// ── weight schemes ───────────────────────────────────────────────────────────
const normalize = (w) => {
  const s = KEYS.reduce((a, k) => a + w[k], 0)
  return { ...Object.fromEntries(KEYS.map((k) => [k, w[k] / s])), ...OPT_IN }
}
const keepsOrder = (w) => KEYS.every((k, i) => i === 0 || w[KEYS[i - 1]] > w[k])

const perturbations = []
for (const k of KEYS) {
  for (const d of [-0.1, -0.05, 0.05, 0.1]) {
    const w = { ...NOMINAL_WEIGHTS }
    w[k] = Math.max(0.01, w[k] + d)
    const weights = normalize(w)
    perturbations.push({ label: `${k} ${d > 0 ? '+' : ''}${d.toFixed(2)}`, signal: k, delta: d, weights, keepsOrder: keepsOrder(weights) })
  }
}
const equal = { label: 'equal weights', weights: normalize({ ventingTrend: 1, biometricTrend: 1, sentiment: 1, sessionContext: 1 }) }

// mulberry32 — seeded so the random families are reproducible
let state = SEED >>> 0
const rand = () => {
  state = (state + 0x6d2b79f5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
// Dirichlet(1,1,1,1), sorted descending — the same magnitude distribution for both families
const magnitudes = () => {
  const g = KEYS.map(() => -Math.log(1 - rand()))
  const s = g.reduce((a, b) => a + b, 0)
  return g.map((x) => x / s).sort((a, b) => b - a)
}
const brokenPermutation = () => {
  let p
  do {
    p = [0, 1, 2, 3]
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[p[i], p[j]] = [p[j], p[i]]
    }
  } while (p.every((x, i) => x === i))
  return p
}
const randomKeep = []
const randomBreak = []
for (let i = 0; i < SAMPLES; i++) {
  const m = magnitudes()
  randomKeep.push({ ...Object.fromEntries(KEYS.map((k, j) => [k, m[j]])), ...OPT_IN })
  const m2 = magnitudes()
  const p = brokenPermutation()
  randomBreak.push({ ...Object.fromEntries(KEYS.map((k, j) => [k, m2[p[j]]])), ...OPT_IN })
}

// ── metrics ──────────────────────────────────────────────────────────────────
const verdict = (x) => x >= THRESHOLD
const agreement = (pts, w) => {
  if (!pts.length) return null
  let same = 0
  for (const p of pts) if (verdict(score(p.inputs, w)) === verdict(p.nominal)) same++
  return same / pts.length
}
const meanAbsDelta = (pts, w) => (pts.length ? pts.reduce((a, p) => a + Math.abs(score(p.inputs, w) - p.nominal), 0) / pts.length : null)

// When does the sustained-calm handoff first fire in each game session?
const gameSessions = Object.values(
  points.filter((p) => p.kind === 'game').reduce((m, p) => ((m[p.session] ??= []).push(p), m), {}),
).filter((ps) => ps.length >= 3)
const firstOffer = (ps, w) => {
  const hist = []
  for (const p of ps) {
    hist.push(w ? score(p.inputs, w) : p.nominal)
    if (shouldOfferHandoff(hist, THRESHOLD)) return (p.t - ps[0].t) / 1000
  }
  return null
}
const nominalOffers = gameSessions.map((ps) => firstOffer(ps))
const handoff = (w) => {
  let same = 0
  let existence = 0
  const shifts = []
  gameSessions.forEach((ps, i) => {
    const a = nominalOffers[i]
    const b = firstOffer(ps, w)
    if (a === b) same++
    if ((a === null) !== (b === null)) existence++
    else if (a !== null) shifts.push(Math.abs(b - a))
  })
  shifts.sort((x, y) => x - y)
  return {
    sameTimingRate: same / gameSessions.length,
    offerAppearedOrVanished: existence,
    medianShiftSeconds: shifts.length ? shifts[Math.floor(shifts.length / 2)] : 0,
    maxShiftSeconds: shifts.length ? shifts[shifts.length - 1] : 0,
  }
}
const evaluate = (w) => ({
  agreeSensitive: agreement(sensitive, w),
  agreeContested: agreement(contested, w),
  meanAbsDelta: meanAbsDelta(sensitive, w),
  handoff: handoff(w),
})

// Per-point view: does a scheme keep the order AMONG THE SIGNALS PRESENT at that
// point? (A globally "broken" vector can still rank the two present signals
// correctly.) This is the sharpest test of "order, not magnitude".
const activeOrder = { preserved: { agree: 0, n: 0 }, broken: { agree: 0, n: 0 } }
for (const w of [...randomKeep, ...randomBreak]) {
  for (const p of contested) {
    const ks = KEYS.filter((k) => p.values[k] !== null)
    const preserved = ks.every((k, i) => i === 0 || w[ks[i - 1]] > w[k])
    const bin = preserved ? activeOrder.preserved : activeOrder.broken
    bin.n++
    if (verdict(score(p.inputs, w)) === verdict(p.nominal)) bin.agree++
  }
}

// Ablation: remove each signal wherever it was present.
const DROP = {
  ventingTrend: (i) => ({ ...i, ventingIntensities: undefined, ventingSessionPeak: undefined }),
  biometricTrend: (i) => ({ ...i, biometricStressScores: undefined }),
  sentiment: (i) => ({ ...i, sentimentScores: undefined }),
  sessionContext: (i) => ({ ...i, sessionDurationSeconds: undefined }),
}
const ablation = KEYS.map((k) => {
  const pts = points.filter((p) => p.values[k] !== null)
  let agree = 0
  let neutral = 0
  let delta = 0
  for (const p of pts) {
    const r = computeReadinessScore(DROP[k](p.inputs))
    if (verdict(r.readinessScore) === verdict(p.nominal)) agree++
    if (!r.contributions.some((c) => c.active && SUBSTANTIVE.has(c.key))) neutral++
    delta += Math.abs(r.readinessScore - p.nominal)
  }
  return {
    signal: k,
    points: pts.length,
    agree: pts.length ? agree / pts.length : null,
    meanAbsDelta: pts.length ? delta / pts.length : null,
    fellToNeutral: neutral,
  }
})

// ── provenance, validation, Fig. 3 check ─────────────────────────────────────
// By signature, not just the device tag — older board sessions carry no
// device_id (see scripts/provenance.mjs).
const provenance = Object.fromEntries(sessions.map((s) => [s.id, biometricProvenance(B[s.id] ?? [])]))
const byProvenance = {}
for (const p of sensitive) byProvenance[provenance[p.session]] = (byProvenance[provenance[p.session]] ?? 0) + 1

// Replay fidelity: on points the live system computed under TODAY's rule, the
// replay must reproduce what was stored. Game flushes follow the current rule
// from 2026-10-03 13:30 UTC (no-venting = no signal); chat and biometric points
// only from the first PERSISTED idle row (migration 011) — before that, those
// routes saw hits only, which is the very bug the replay deliberately corrects.
const firstIdle = ventRows.find((v) => v.input_type === 'idle')
const routeCutoff = firstIdle ? ms(firstIdle.recorded_at) : Infinity
const current = points.filter((p) =>
  p.kind === 'game' ? p.t >= ms('2026-10-03T13:30:00Z') : p.t >= routeCutoff,
)
const fidelity = current.length
  ? { points: current.length, maxAbsDiff: Math.max(...current.map((p) => Math.abs(p.nominal - p.stored))) }
  : null
if (process.argv.includes('--debug')) {
  for (const p of current.filter((q) => Math.abs(q.nominal - q.stored) > 0.01)) {
    const i = p.inputs
    console.log(
      `[fidelity] ${p.session.slice(0, 8)} ${p.recordedAt.slice(11, 19)} ${p.kind.padEnd(9)} stored ${p.stored.toFixed(3)} replay ${p.nominal.toFixed(3)}`,
      `vent=[${i.ventingIntensities.join(',')}] peak=${i.ventingSessionPeak} dur=${i.sessionDurationSeconds.toFixed(0)}s`,
      i.sentimentScores ? `sent=[${i.sentimentScores.map((x) => x.toFixed(2)).join(',')}]` : '',
    )
  }
}

let fig3 = null
const fig3Path = join(ROOT, 'fig3-data.json')
if (existsSync(fig3Path)) {
  const f3 = JSON.parse(readFileSync(fig3Path, 'utf8'))
  fig3 = Object.fromEntries(
    Object.entries(f3).map(([arm, { session, points: plotted }]) => {
      const mine = new Map(points.filter((p) => p.session === session).map((p) => [p.recordedAt, p.nominal]))
      const diffs = plotted.filter((q) => mine.has(q.recorded_at)).map((q) => Math.abs(mine.get(q.recorded_at) - q.readiness_score))
      return [arm, { session, plotted: plotted.length, matched: diffs.length, maxAbsDiff: diffs.length ? Math.max(...diffs) : null, over001: diffs.filter((d) => d > 0.01).length }]
    }),
  )
}

// ── run + report ─────────────────────────────────────────────────────────────
const t0 = Date.now()
const results = {
  generatedAt: new Date().toISOString(),
  params: { samples: SAMPLES, seed: SEED, threshold: THRESHOLD, nominal: { ...NOMINAL_WEIGHTS } },
  counts: {
    sessions: sessions.length,
    decisionPoints: points.length,
    weightSensitive: sensitive.length,
    contested: contested.length,
    gameSessionsForHandoff: gameSessions.length,
    sensitiveByBiometricProvenance: byProvenance,
  },
  perturbations: perturbations.map((p) => ({ ...p, ...evaluate(p.weights) })),
  equal: { ...equal, ...evaluate(equal.weights) },
  random: {
    keep: randomKeep.map((w) => agreement(contested, w)),
    break: randomBreak.map((w) => agreement(contested, w)),
    keepSensitive: randomKeep.map((w) => agreement(sensitive, w)),
    breakSensitive: randomBreak.map((w) => agreement(sensitive, w)),
  },
  activeOrder: {
    preserved: { ...activeOrder.preserved, rate: activeOrder.preserved.agree / activeOrder.preserved.n },
    broken: { ...activeOrder.broken, rate: activeOrder.broken.agree / activeOrder.broken.n },
  },
  ablation,
  fidelity,
  fig3,
}
writeFileSync(join(ROOT, 'weight-sensitivity-data.json'), JSON.stringify(results, null, 2))

const pct = (x) => (x === null ? '  n/a' : (100 * x).toFixed(1).padStart(5) + '%')
const quantile = (xs, q) => {
  const a = xs.filter((x) => x !== null).sort((x, y) => x - y)
  return a[Math.min(a.length - 1, Math.floor(q * a.length))]
}
const c = results.counts
console.log(`\nREADINESS WEIGHT SENSITIVITY — ${c.sessions} sessions, ${c.decisionPoints} decision points`)
console.log(`  weight-sensitive (>=2 signals): ${c.weightSensitive}   contested (signals disagree): ${c.contested}`)
console.log(`  sensitive points by biometric source: ${JSON.stringify(c.sensitiveByBiometricProvenance)}`)
if (fidelity) console.log(`  replay fidelity on current-rule sessions: ${fidelity.points} points, max |diff| ${fidelity.maxAbsDiff.toFixed(4)}`)
console.log('\nONE-AT-A-TIME PERTURBATIONS (renormalised)        agree:sensitive  contested  mean|d|  handoff same-timing')
for (const p of results.perturbations) {
  console.log(`  ${p.label.padEnd(26)} ${p.keepsOrder ? 'order kept  ' : 'ORDER BROKEN'}   ${pct(p.agreeSensitive)}    ${pct(p.agreeContested)}   ${p.meanAbsDelta.toFixed(3)}    ${pct(p.handoff.sameTimingRate)} (max shift ${p.handoff.maxShiftSeconds.toFixed(0)}s)`)
}
const e = results.equal
console.log(`  ${'equal weights'.padEnd(26)} ${'ORDER BROKEN'}   ${pct(e.agreeSensitive)}    ${pct(e.agreeContested)}   ${e.meanAbsDelta.toFixed(3)}    ${pct(e.handoff.sameTimingRate)}`)
console.log(`\nRANDOM WEIGHTS (n=${SAMPLES} each, same magnitudes) — agreement on contested points`)
for (const [name, xs] of [['order kept', results.random.keep], ['order broken', results.random.break]]) {
  console.log(`  ${name.padEnd(13)} median ${pct(quantile(xs, 0.5))}   5th pct ${pct(quantile(xs, 0.05))}   min ${pct(quantile(xs, 0))}`)
}
const ao = results.activeOrder
console.log(`  per point, order AMONG PRESENT signals: kept ${pct(ao.preserved.rate)} (n=${ao.preserved.n})   broken ${pct(ao.broken.rate)} (n=${ao.broken.n})`)
console.log('\nABLATION (signal removed where present)   verdict kept   mean|d|   fell to neutral')
for (const a of ablation) console.log(`  ${a.signal.padEnd(16)} ${String(a.points).padStart(5)} pts     ${pct(a.agree)}      ${a.meanAbsDelta?.toFixed(3) ?? ' n/a'}     ${a.fellToNeutral}`)
if (fig3) {
  console.log('\nFIG. 3 CHECK (plotted values vs current-rule replay)')
  for (const [arm, f] of Object.entries(fig3)) console.log(`  ${arm.padEnd(16)} ${f.session.slice(0, 8)}  matched ${f.matched}/${f.plotted}  max |diff| ${f.maxAbsDiff?.toFixed(4) ?? 'n/a'}  points >0.01: ${f.over001}`)
}
console.log(`\nwrote weight-sensitivity-data.json  (${((Date.now() - t0) / 1000).toFixed(1)}s)  ->  python scripts/plot-weight-sensitivity.py`)
