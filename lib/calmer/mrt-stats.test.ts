import { describe, it, expect } from 'vitest'
import { MIN_PARTICIPANTS, tCrit95, wcls, type WclsRow } from './mrt-stats'

describe('tCrit95', () => {
  it('matches textbook two-sided 95% t values', () => {
    expect(tCrit95(5)).toBeCloseTo(2.571, 1)
    expect(tCrit95(10)).toBeCloseTo(2.228, 2)
    expect(tCrit95(20)).toBeCloseTo(2.086, 2)
    expect(tCrit95(30)).toBeCloseTo(2.042, 2)
    expect(tCrit95(1000)).toBeCloseTo(1.962, 2)
  })
})

describe('wcls', () => {
  // With constant p and only an intercept, beta is the difference in means.
  it('equals the treatment-minus-control difference in means', () => {
    const rows: WclsRow[] = [
      { person: 1, a: 1, y: 1 }, { person: 1, a: 0, y: 0 },
      { person: 2, a: 1, y: 1 }, { person: 2, a: 0, y: 1 },
      { person: 3, a: 1, y: 0 }, { person: 3, a: 0, y: 0 },
    ]
    expect(wcls(rows)!.beta).toBeCloseTo(2 / 3 - 1 / 3, 10)
  })

  it('returns null when only one arm was observed', () => {
    expect(wcls([{ person: 1, a: 1, y: 1 }, { person: 2, a: 1, y: 0 }])).toBeNull()
  })

  it('withholds a confidence interval below the minimum number of participants', () => {
    const rows: WclsRow[] = []
    for (let p = 0; p < MIN_PARTICIPANTS - 1; p++) rows.push({ person: p, a: 1, y: 1 }, { person: p, a: 0, y: 0 })
    expect(wcls(rows)!.ci).toBeNull()
    rows.push({ person: 'last', a: 1, y: 1 }, { person: 'last', a: 0, y: 0.5 })
    expect(wcls(rows)!.ci).not.toBeNull()
  })

  it('clusters by person: duplicating one person\'s sessions does not shrink the SE like new people would', () => {
    const base: WclsRow[] = []
    for (let p = 0; p < 12; p++) {
      base.push({ person: p, a: 1, y: p % 3 === 0 ? 1 : 0 }, { person: p, a: 0, y: p % 2 === 0 ? 1 : 0 })
    }
    const repeatedWithin = base.flatMap((r) => [r, { ...r }]) // same people, twice the sessions
    const moreSessionsSE = wcls(repeatedWithin)!.se
    const baseSE = wcls(base)!.se
    // naive (unclustered) SE would fall by ~1/sqrt(2); clustered stays put
    expect(moreSessionsSE).toBeCloseTo(baseSE, 6)
  })
})
