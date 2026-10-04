/**
 * Safety-layer evaluation (roadmap B2).
 *
 * The paper cites an evaluation that found none of 29 agents adequate on
 * crisis prompts [Pichowicz et al. 2025] and then presents a layered detector.
 * This measures that detector on a labelled set — the question a reviewer
 * will ask is "how good is YOURS?".
 *
 * It runs the EXACT production path: the keyword pre-filter
 * (detectSafetyTrigger), the LLM risk check (SAFETY_CLASSIFIER_SYSTEM via
 * chatModel() + generateText, as in app/api/chat/route.ts) and combineRisk.
 * Three configurations are scored from the same calls, so the LLM layer's
 * contribution is measured rather than assumed:
 *   keyword-only   escalate iff a trigger phrase matched
 *   LLM-only       the model's verdict alone
 *   combined       production: the higher of the two
 *
 * LLM verdicts vary between calls, so every message is classified --runs times
 * (default 3); metrics use the majority verdict, and verdict stability is
 * reported. The safety-critical number is RECALL on the crisis class — every
 * missed crisis is listed. Read-only; touches no database.
 *
 * Usage:  node --no-warnings scripts/safety-eval.mjs [--runs 3] [--fresh]
 * Needs:  Node 23.6+, .env.local with GROQ_API_KEY (CALMER_CHAT_MODEL optional).
 * Writes: safety-eval-raw.json (per-call cache — reruns resume from it; --fresh
 *         starts over) and safety-eval-results.json. Both gitignored.
 */
import './ts-imports.mjs' // first: lets Node resolve the app's extensionless TS imports
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=')
  if (i > 0 && !line.trim().startsWith('#')) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim()
}
if (!process.env.GROQ_API_KEY) throw new Error('.env.local needs GROQ_API_KEY')

const load = (p) => import(pathToFileURL(join(ROOT, p)).href)
const { generateText } = await import('ai')
const { chatModel, chatModelId } = await load('lib/calmer/chat-model.ts')
const { SAFETY_CLASSIFIER_SYSTEM, combineRisk } = await load('lib/calmer/safety.ts')
const { detectSafetyTrigger } = await load('lib/calmer/readiness.ts')

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name)
  return i > -1 ? Number(process.argv[i + 1]) : dflt
}
const RUNS = arg('runs', 3)
const RAW = join(ROOT, 'safety-eval-raw.json')
const { items } = JSON.parse(readFileSync(join(ROOT, 'scripts/safety-eval-set.json'), 'utf8'))
const model = chatModelId()

// ── classify (cached per message x run x model) ──────────────────────────────
const cache = existsSync(RAW) && !process.argv.includes('--fresh') ? JSON.parse(readFileSync(RAW, 'utf8')) : {}
// The prompt is part of the key: change SAFETY_CLASSIFIER_SYSTEM and every
// verdict is re-fetched instead of silently reused from the old prompt.
const promptHash = createHash('sha256').update(SAFETY_CLASSIFIER_SYSTEM).digest('hex').slice(0, 10)
const key = (id, run) => `${model}|${promptHash}|${id}|${run}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function classify(text) {
  for (let attempt = 0; ; attempt++) {
    try {
      const { text: out } = await generateText({ model: chatModel(), system: SAFETY_CLASSIFIER_SYSTEM, prompt: text, maxRetries: 0 })
      return out
    } catch (err) {
      const msg = String(err?.message ?? err)
      if (attempt >= 6) return `ERROR: ${msg}` // recorded, counted as no verdict
      // rate limits: back off and retry
      await sleep(Math.min(60000, 4000 * 2 ** attempt))
    }
  }
}

const todo = []
for (const it of items) for (let run = 0; run < RUNS; run++) if (!(key(it.id, run) in cache)) todo.push({ it, run })
if (todo.length) console.log(`classifying ${todo.length} message-runs with ${model} (cached: ${items.length * RUNS - todo.length})…`)
let done = 0
for (const { it, run } of todo) {
  cache[key(it.id, run)] = await classify(it.text)
  writeFileSync(RAW, JSON.stringify(cache, null, 2)) // resumable
  if (++done % 25 === 0) console.log(`  ${done}/${todo.length}`)
  await sleep(250)
}

// ── score ────────────────────────────────────────────────────────────────────
const majority = (xs) => {
  const c = {}
  for (const x of xs) c[x] = (c[x] ?? 0) + 1
  return Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] === 'high' ? -1 : 1))[0][0]
}
const rows = items.map((it) => {
  const verdicts = Array.from({ length: RUNS }, (_, r) => cache[key(it.id, r)])
  const keyword = detectSafetyTrigger(it.text).triggered
  const llmRuns = verdicts.map((v) => combineRisk(false, v))
  const combinedRuns = verdicts.map((v) => combineRisk(keyword, v))
  return {
    ...it,
    keyword,
    verdicts,
    errors: verdicts.filter((v) => String(v).startsWith('ERROR')).length,
    stable: new Set(llmRuns).size === 1,
    pred: {
      keyword: keyword ? 'high' : 'none',
      llm: majority(llmRuns),
      combined: majority(combinedRuns),
    },
    runs: { llm: llmRuns, combined: combinedRuns },
  }
})
const labelled = rows.filter((r) => r.label !== 'ambiguous')

function binary(config, pick = (r) => r.pred[config]) {
  let tp = 0, fn = 0, fp = 0, tn = 0
  for (const r of labelled) {
    const truth = r.label === 'high'
    const esc = pick(r) === 'high'
    if (truth && esc) tp++
    else if (truth) fn++
    else if (esc) fp++
    else tn++
  }
  const safe = (a, b) => (b ? a / b : null)
  const recall = safe(tp, tp + fn)
  const precision = safe(tp, tp + fp)
  return {
    tp, fn, fp, tn,
    recall,
    precision,
    specificity: safe(tn, tn + fp),
    f1: recall && precision ? (2 * recall * precision) / (recall + precision) : 0,
  }
}
const LABELS = ['high', 'low', 'none']
const confusion = (config) =>
  Object.fromEntries(LABELS.map((t) => [t, Object.fromEntries(LABELS.map((p) => [p, labelled.filter((r) => r.label === t && r.pred[config] === p).length]))]))
const threeClassAccuracy = (config) => labelled.filter((r) => r.label === r.pred[config]).length / labelled.length
const byKind = (config) => {
  const out = {}
  for (const r of labelled) {
    const k = `${r.label}/${r.kind}`
    out[k] ??= { n: 0, escalated: 0 }
    out[k].n++
    if (r.pred[config] === 'high') out[k].escalated++
  }
  return out
}
// per-run recall, to show what one live call (not a majority vote) achieves
const perRunRecall = Array.from({ length: RUNS }, (_, run) => binary('combined', (r) => r.runs.combined[run]).recall)

const configs = ['keyword', 'llm', 'combined']
const results = {
  generatedAt: new Date().toISOString(),
  model,
  promptHash,
  runs: RUNS,
  counts: Object.fromEntries(['high', 'low', 'none', 'ambiguous'].map((l) => [l, rows.filter((r) => r.label === l).length])),
  errors: rows.reduce((a, r) => a + r.errors, 0),
  stability: rows.filter((r) => r.stable).length / rows.length,
  binary: Object.fromEntries(configs.map((c) => [c, binary(c)])),
  perRunRecallCombined: perRunRecall,
  threeClassAccuracy: { llm: threeClassAccuracy('llm'), combined: threeClassAccuracy('combined') },
  confusion: { llm: confusion('llm'), combined: confusion('combined') },
  byKind: Object.fromEntries(configs.map((c) => [c, byKind(c)])),
  missedCrises: labelled.filter((r) => r.label === 'high' && r.pred.combined !== 'high').map((r) => ({ id: r.id, kind: r.kind, text: r.text, verdicts: r.verdicts, keyword: r.keyword })),
  falseAlarms: labelled.filter((r) => r.label !== 'high' && r.pred.combined === 'high').map((r) => ({ id: r.id, label: r.label, kind: r.kind, text: r.text, keyword: r.keyword, verdicts: r.verdicts })),
  ambiguous: rows.filter((r) => r.label === 'ambiguous').map((r) => ({ id: r.id, kind: r.kind, text: r.text, combined: r.pred.combined, verdicts: r.verdicts })),
}
writeFileSync(join(ROOT, 'safety-eval-results.json'), JSON.stringify(results, null, 2))

// ── report ───────────────────────────────────────────────────────────────────
const pct = (x) => (x === null ? '  n/a' : `${(100 * x).toFixed(1)}%`.padStart(6))
const c = results.counts
console.log(`\nSAFETY LAYER — ${model}, ${RUNS} runs/message, ${c.high} crisis / ${c.low} distress / ${c.none} ordinary (+${c.ambiguous} ambiguous, unscored)`)
console.log(`call errors: ${results.errors}   LLM verdict identical across runs: ${pct(results.stability)} of messages`)
console.log('\nESCALATION TO SAFETY MODE (crisis = positive)   recall  precision  specificity   missed  false alarms')
for (const cfg of configs) {
  const b = results.binary[cfg]
  console.log(`  ${cfg.padEnd(14)}                        ${pct(b.recall)}   ${pct(b.precision)}      ${pct(b.specificity)}      ${String(b.fn).padStart(3)}      ${String(b.fp).padStart(3)}`)
}
console.log(`  combined recall per single run: ${perRunRecall.map(pct).join('  ')}`)
console.log(`\n3-class accuracy (high/low/none): LLM ${pct(results.threeClassAccuracy.llm)}   combined ${pct(results.threeClassAccuracy.combined)}`)
console.log('\nESCALATION RATE BY KIND            keyword   LLM   combined')
for (const k of Object.keys(results.byKind.combined)) {
  const f = (cfg) => { const v = results.byKind[cfg][k]; return `${v.escalated}/${v.n}`.padStart(6) }
  console.log(`  ${k.padEnd(26)} ${f('keyword')} ${f('llm')}   ${f('combined')}`)
}
console.log('\nMISSED CRISES (combined):')
if (!results.missedCrises.length) console.log('  none')
for (const m of results.missedCrises) console.log(`  ${m.id} [${m.kind}] "${m.text}"  -> ${JSON.stringify(m.verdicts)}`)
console.log('\nFALSE ALARMS (combined):')
if (!results.falseAlarms.length) console.log('  none')
for (const f of results.falseAlarms) console.log(`  ${f.id} [${f.label}/${f.kind}] keyword=${f.keyword} "${f.text}" -> ${JSON.stringify(f.verdicts)}`)
console.log('\nAMBIGUOUS (unscored):')
for (const a of results.ambiguous) console.log(`  ${a.id} [${a.kind}] -> ${a.combined}  "${a.text}"`)
console.log('\nwrote safety-eval-results.json')
