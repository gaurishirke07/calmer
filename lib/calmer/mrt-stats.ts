// Statistics for the micro-randomised trial analysis (scripts/mrt-analysis.mjs).
// Kept in lib/ so it is unit-tested; the script only fetches and reports.
//
// Weighted and centred least squares (WCLS) for the causal excursion effect
// [Boruvka et al. 2018, JASA 113:1112-1121]. With a constant randomisation
// probability p and numerator probability p~ = p, every weight is 1 and the
// model is Y ~ 1 + (A - p): beta is the marginal effect of treatment (a risk
// difference for binary Y). Standard errors are clustered by participant (CR1)
// with a t reference on (participants - 2) degrees of freedom.

export const MIN_PARTICIPANTS = 10

/** Two-sided 95% t critical value via a Cornish–Fisher expansion (accurate to ~0.01 for df >= 3). */
export function tCrit95(df: number): number {
  const z = 1.959963985
  const z3 = z ** 3
  const z5 = z ** 5
  const z7 = z ** 7
  return (
    z +
    (z3 + z) / (4 * df) +
    (5 * z5 + 16 * z3 + 3 * z) / (96 * df ** 2) +
    (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3)
  )
}

export interface WclsRow {
  person: string | number
  a: 0 | 1
  y: number
}

export interface WclsFit {
  beta: number // causal excursion effect
  se: number // cluster-robust standard error
  ci: [number, number] | null // null below MIN_PARTICIPANTS
  df: number
  n: number
  participants: number
}

export function wcls(rows: WclsRow[], p = 0.5): WclsFit | null {
  const people = new Set(rows.map((r) => r.person))
  if (rows.length < 2) return null
  let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0
  for (const r of rows) {
    const c = r.a - p
    s11 += 1
    s12 += c
    s22 += c * c
    t1 += r.y
    t2 += c * r.y
  }
  const det = s11 * s22 - s12 * s12
  if (Math.abs(det) < 1e-12) return null // only one arm observed
  const inv = [
    [s22 / det, -s12 / det],
    [-s12 / det, s11 / det],
  ]
  const alpha = inv[0][0] * t1 + inv[0][1] * t2
  const beta = inv[1][0] * t1 + inv[1][1] * t2

  // meat: sum over participants of (X_i' e_i)(X_i' e_i)'
  const score = new Map<string | number, [number, number]>()
  for (const r of rows) {
    const c = r.a - p
    const e = r.y - alpha - beta * c
    const s = score.get(r.person) ?? [0, 0]
    s[0] += e
    s[1] += c * e
    score.set(r.person, s)
  }
  let m11 = 0, m12 = 0, m22 = 0
  for (const [u, v] of score.values()) {
    m11 += u * u
    m12 += u * v
    m22 += v * v
  }
  const k = people.size > 1 ? people.size / (people.size - 1) : 1 // CR1 small-sample factor
  const [a0, a1] = inv[1]
  const se = Math.sqrt(Math.max(k * (a0 * a0 * m11 + 2 * a0 * a1 * m12 + a1 * a1 * m22), 0))
  const df = people.size - 2
  const ci: [number, number] | null =
    people.size >= MIN_PARTICIPANTS && df >= 3 ? [beta - tCrit95(df) * se, beta + tCrit95(df) * se] : null
  return { beta, se, ci, df, n: rows.length, participants: people.size }
}
