/**
 * Micro-randomised trial analysis for the venting -> reflection handoff
 * (roadmap B1). Protocol: paper/MRT-PROTOCOL.md.
 *
 * DESIGN AS BUILT. At every rage-room start the game randomises the handoff
 * rule with probability 0.5: 'readiness' (offer reflection once the readiness
 * score holds above 0.66 for three consecutive readings) vs 'timer' (offer at a
 * fixed 60 s). Logged as session.mrt_condition. A decision point = one
 * randomised session; every session is eligible (availability = 1).
 *
 * PROXIMAL OUTCOMES (computable from data the app already stores):
 *   Y1 engaged   — user sent >= 1 chat message in the same session within
 *                  10 min of the venting phase ending (binary; higher is better)
 *   Y2 revent    — user started another rage-room session within 15 min
 *                  (binary; lower is better)
 *   Y3 ventSecs  — length of the venting phase in seconds (continuous;
 *                  descriptive — the readiness arm can end it early)
 *
 * ESTIMATOR. The causal excursion effect via weighted and centred least
 * squares [Boruvka et al. 2018, JASA 113:1112-1121]: regress Y on an intercept
 * and the centred treatment (A - p~). With a constant randomisation
 * probability p = p~ = 0.5 every weight is 1, so beta is the marginal effect of
 * the readiness rule vs the timer (a risk difference for binary outcomes).
 * Standard errors are clustered by participant (CR1) with a t reference on
 * n - 2 degrees of freedom. Below MIN_PARTICIPANTS the script reports point
 * estimates only — inference from a handful of people is not inference.
 * For binary outcomes, the log relative-risk estimator of Qian et al. 2021
 * (Biometrika 108:507-527) is the recommended sensitivity analysis.
 *
 * OFFER TIMES. Sessions randomised by the database (session.randomised_by =
 * 'db', migration 013) have an authoritative handoff_event log: an
 * offer_shown row is the offer the user saw, and no such row means no offer.
 * Older sessions have no log, so their offers are reconstructed from stored
 * readiness snapshots with the CURRENT rule (sustained 3-reading crossing,
 * 2026-10-03); older still used a single crossing. For a real trial, enrol
 * only after the rule is frozen and 013 is run, and analyse 'db' sessions.
 *
 * Usage:   node --no-warnings scripts/mrt-analysis.mjs            analyse stored sessions
 *          node --no-warnings scripts/mrt-analysis.mjs --power    simulation power table
 * Needs:   Node 23.6+, .env.local with the service-role key (not for --power).
 * Writes:  mrt-analysis-results.json (gitignored). Read-only on the database.
 */
import './ts-imports.mjs' // first: lets Node resolve the app's extensionless TS imports
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const P = 0.5 // randomisation probability (start_game_session() in migration 013: random() < 0.5)
const THRESHOLD = 0.66 // CALM_THRESHOLD
const TIMER_HANDOFF_SECONDS = 60 // control arm
const ENGAGE_WINDOW_MS = 10 * 60 * 1000
const REVENT_WINDOW_MS = 15 * 60 * 1000

// ── statistics: lib/calmer/mrt-stats.ts (unit-tested) ───────────────────────
const { wcls: wclsAt, tCrit95: tCrit, MIN_PARTICIPANTS } = await import(
  pathToFileURL(join(ROOT, 'lib/calmer/mrt-stats.ts')).href
)
const wcls = (rows) => wclsAt(rows, P)

// ── power by simulation, with the same estimator ─────────────────────────────
let seed = 11
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())

/** Continuous outcome, standardised effect d, between-person ICC; returns power. */
function simulatePower(N, M, d, { icc = 0.3, reps = 600 } = {}) {
  let rejections = 0
  for (let r = 0; r < reps; r++) {
    const rows = []
    for (let i = 0; i < N; i++) {
      const u = gauss() * Math.sqrt(icc)
      for (let j = 0; j < M; j++) {
        const a = rand() < P ? 1 : 0
        rows.push({ person: i, a, y: u + d * a + gauss() * Math.sqrt(1 - icc) })
      }
    }
    const fit = wcls(rows)
    if (fit && Math.abs(fit.beta / fit.se) > tCrit(N - 2)) rejections++
  }
  return rejections / reps
}
/**
 * Normal-approximation sample size for 80% power, for comparison with the
 * simulation. Uses the TOTAL outcome variance: this estimator (intercept +
 * centred treatment) does not remove person effects, so between-person
 * variance stays in the residual. An earlier version discounted it by (1 - ICC)
 * and was visibly optimistic against the simulation (25 vs ~37 people for
 * d = 0.3, M = 10). Person-level covariates in the model would win some of it back.
 */
const approxN = (M, d) => Math.ceil((1.959964 + 0.841621) ** 2 / (d * d * M * P * (1 - P)))

if (process.argv.includes('--power')) {
  console.log('POWER (two-sided alpha 0.05, continuous outcome, ICC 0.3, 600 simulated trials per cell)')
  console.log('d = standardised effect of the readiness rule vs the timer; M = randomised sessions per person\n')
  const out = []
  for (const d of [0.3, 0.5]) {
    for (const M of [5, 10]) {
      const cells = [10, 20, 30, 50].map((N) => ({ N, power: simulatePower(N, M, d) }))
      out.push({ d, M, approxN80: approxN(M, d), cells })
      console.log(`  d=${d}  M=${String(M).padStart(2)}   ${cells.map((c) => `N=${c.N}: ${(100 * c.power).toFixed(0)}%`.padEnd(12)).join(' ')}   normal-approx N for 80%: ${approxN(M, d)}`)
    }
  }
  writeFileSync(join(ROOT, 'mrt-power.json'), JSON.stringify(out, null, 2))
  console.log('\nwrote mrt-power.json')
  process.exit(0)
}

// ── data ─────────────────────────────────────────────────────────────────────
const { shouldOfferHandoff } = await import(pathToFileURL(join(ROOT, 'lib/calmer/readiness.ts')).href)
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
const [sessions, states, convo, events] = await Promise.all([
  // randomised_by exists only after migration 013
  all('session?select=id,user_id,start_time,mrt_condition,randomised_by&order=start_time.asc')
    .catch((e) => (String(e.message).includes('HTTP 400') ? all('session?select=id,user_id,start_time,mrt_condition&order=start_time.asc') : Promise.reject(e))),
  all('emotional_state?select=session_id,source,readiness_score,recorded_at&source=eq.interaction&order=recorded_at.asc'),
  all('therapist_convo?select=session_id,sender,created_at&sender=eq.user&order=created_at.asc'),
  // Absent until migration 013 is run; then every session's offers are logged.
  // a missing table (before 013) is a 404; any other failure must stop the run
  all('handoff_event?select=session_id,event,recorded_at&order=recorded_at.asc,id.asc')
    .catch((e) => (String(e.message).includes('HTTP 404') ? [] : Promise.reject(e))),
])
const ms = (s) => new Date(s).getTime()
const flushes = states.reduce((m, e) => ((m[e.session_id] ??= []).push(e), m), {})
const userMsgs = convo.reduce((m, c) => ((m[c.session_id] ??= []).push(ms(c.created_at)), m), {})
const offerLog = events.reduce((m, e) => ((m[e.session_id] ??= []).push(e), m), {})
// every game session (randomised or not) for the re-vent outcome
const gameStarts = sessions.filter((s) => flushes[s.id]?.length).map((s) => ({ user: s.user_id, id: s.id, t: ms(s.start_time) }))

const points = []
const excluded = []
for (const s of sessions) {
  if (s.mrt_condition !== 'readiness' && s.mrt_condition !== 'timer') continue
  const f = flushes[s.id] ?? []
  if (!f.length) {
    excluded.push({ id: s.id, why: 'randomised but never played (no game snapshots)' })
    continue
  }
  const start = ms(s.start_time)
  const ventEnd = ms(f[f.length - 1].recorded_at)
  let offerAt = null
  const logged = s.randomised_by === 'db'
  const log = offerLog[s.id] ?? []
  if (logged) {
    const shown = log.find((e) => e.event === 'offer_shown')
    offerAt = shown ? ms(shown.recorded_at) : null
  } else if (s.mrt_condition === 'readiness') {
    const hist = []
    for (const e of f) {
      hist.push(Number(e.readiness_score))
      if (shouldOfferHandoff(hist, THRESHOLD)) { offerAt = ms(e.recorded_at); break }
    }
  } else if (ventEnd - start >= TIMER_HANDOFF_SECONDS * 1000) {
    offerAt = start + TIMER_HANDOFF_SECONDS * 1000
  }
  const engaged = (userMsgs[s.id] ?? []).some((t) => t >= ventEnd - 5000 && t <= ventEnd + ENGAGE_WINDOW_MS) ? 1 : 0
  const revent = gameStarts.some((g) => g.user === s.user_id && g.id !== s.id && g.t > start && g.t <= ventEnd + REVENT_WINDOW_MS) ? 1 : 0
  points.push({
    session: s.id,
    person: s.user_id,
    a: s.mrt_condition === 'readiness' ? 1 : 0,
    offered: offerAt !== null,
    offerSecs: offerAt === null ? null : (offerAt - start) / 1000,
    offerSource: logged ? 'logged' : 'replayed',
    // only knowable from the log: did they take the offer itself?
    accepted: logged ? (log.some((e) => e.event === 'offer_accepted') ? 1 : 0) : null,
    engaged,
    revent,
    ventSecs: (ventEnd - start) / 1000,
  })
}

const outcome = (key) => wcls(points.map((p) => ({ person: p.person, a: p.a, y: p[key] })))
const arm = (a) => points.filter((p) => p.a === a)
const mean = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null)
const results = {
  generatedAt: new Date().toISOString(),
  warning:
    'PIPELINE TEST ON DEVELOPER DATA — not evidence. The two participants are the authors; sessions predate the frozen rule.',
  participants: new Set(points.map((p) => p.person)).size,
  decisionPoints: points.length,
  byArm: Object.fromEntries(
    [['readiness', 1], ['timer', 0]].map(([name, a]) => {
      const ps = arm(a)
      return [name, {
        sessions: ps.length,
        offeredRate: mean(ps.map((p) => (p.offered ? 1 : 0))),
        medianOfferSecs: ps.filter((p) => p.offered).map((p) => p.offerSecs).sort((x, y) => x - y)[Math.floor(ps.filter((p) => p.offered).length / 2)] ?? null,
        loggedSessions: ps.filter((p) => p.offerSource === 'logged').length,
        acceptedRate: mean(ps.filter((p) => p.offered && p.accepted !== null).map((p) => p.accepted)),
        engagedRate: mean(ps.map((p) => p.engaged)),
        reventRate: mean(ps.map((p) => p.revent)),
        meanVentSecs: mean(ps.map((p) => p.ventSecs)),
      }]
    }),
  ),
  effects: { engaged: outcome('engaged'), revent: outcome('revent'), ventSecs: outcome('ventSecs') },
  excluded,
}
writeFileSync(join(ROOT, 'mrt-analysis-results.json'), JSON.stringify(results, null, 2))

const f = (x, d = 2) => (x === null || x === undefined ? 'n/a' : Number(x).toFixed(d))
console.log(`\nMRT ANALYSIS — ${results.decisionPoints} randomised sessions from ${results.participants} participant(s)`)
console.log(`!! ${results.warning}\n`)
for (const [name, b] of Object.entries(results.byArm)) {
  console.log(`  ${name.padEnd(9)} sessions ${String(b.sessions).padStart(3)} (${b.loggedSessions} logged)  offered ${f(100 * b.offeredRate, 0)}% (median at ${f(b.medianOfferSecs, 0)} s, accepted ${b.acceptedRate === null ? 'n/a' : f(100 * b.acceptedRate, 0) + '%'})  engaged ${f(100 * b.engagedRate, 0)}%  re-vent ${f(100 * b.reventRate, 0)}%  mean venting ${f(b.meanVentSecs, 0)} s`)
}
console.log('\nCAUSAL EXCURSION EFFECT (readiness rule minus timer), WCLS')
for (const [name, e] of Object.entries(results.effects)) {
  if (!e) { console.log(`  ${name.padEnd(9)} not estimable (needs both arms)`); continue }
  const ci = e.ci ? `95% CI [${f(e.ci[0])}, ${f(e.ci[1])}]` : `no CI: ${e.participants} participant(s) < ${MIN_PARTICIPANTS} needed`
  console.log(`  ${name.padEnd(9)} beta ${f(e.beta)}  (cluster SE ${f(e.se)})  ${ci}`)
}
if (excluded.length) console.log(`\nexcluded: ${excluded.length} (${[...new Set(excluded.map((x) => x.why))].join('; ')})`)
console.log('\nwrote mrt-analysis-results.json')
