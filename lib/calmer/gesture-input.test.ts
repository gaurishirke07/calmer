import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { INITIAL_FIST, MEDIAPIPE_VERSION, isFist, palmPoint, smooth, stepFist, type FistState } from './gesture-input'

describe('MediaPipe version pin', () => {
  // The WASM runtime is loaded from a CDN by version; it must match the JS API
  // that npm installed, or the recognizer fails at runtime.
  it('matches the installed @mediapipe/tasks-vision', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'node_modules/@mediapipe/tasks-vision/package.json'), 'utf8'))
    expect(MEDIAPIPE_VERSION).toBe(pkg.version)
  })
})

describe('palmPoint', () => {
  const hand = (x: number, y: number) => Array.from({ length: 21 }, () => ({ x, y }))

  it('averages the palm landmarks and mirrors x for a selfie view', () => {
    expect(palmPoint(hand(0.2, 0.4))).toEqual({ x: 0.8, y: 0.4 })
  })

  it('returns null without a full hand', () => {
    expect(palmPoint([{ x: 0.5, y: 0.5 }])).toBeNull()
  })
})

describe('smooth', () => {
  it('moves part-way toward the new point', () => {
    expect(smooth({ x: 0, y: 0 }, { x: 1, y: 1 }, 0.5)).toEqual({ x: 0.5, y: 0.5 })
    expect(smooth(null, { x: 1, y: 1 })).toEqual({ x: 1, y: 1 })
  })
})

describe('isFist', () => {
  it('needs a confident Closed_Fist', () => {
    expect(isFist('Closed_Fist', 0.9)).toBe(true)
    expect(isFist('Closed_Fist', 0.4)).toBe(false)
    expect(isFist('Open_Palm', 0.99)).toBe(false)
    expect(isFist(undefined, undefined)).toBe(false)
  })
})

describe('stepFist', () => {
  // Run a frame sequence (true = fist) at 50 ms per frame; collect events.
  const run = (frames: boolean[], start: FistState = INITIAL_FIST) => {
    let s = start
    const events: string[] = []
    frames.forEach((f, i) => {
      const r = stepFist(s, f, i * 50)
      s = r.state
      if (r.pressed) events.push(`press@${i}`)
      if (r.released) events.push(`release@${i}`)
    })
    return events
  }

  it('presses once on closing the hand and releases on opening it', () => {
    expect(run([false, true, true, true, false, false])).toEqual(['press@1', 'release@5'])
  })

  it('does not drop a held fist on a single misclassified frame', () => {
    expect(run([true, true, false, true, true])).toEqual(['press@0'])
  })

  it('does not rapid-fire: a re-close inside the gap is ignored', () => {
    // press at 0 ms, release at 100 ms, close again at 150 ms (< 250 ms gap)
    expect(run([true, false, false, true, true])).toEqual(['press@0', 'release@2'])
  })

  it('allows a fresh punch once the gap has passed', () => {
    expect(run([true, false, false, false, false, false, true])).toEqual(['press@0', 'release@2', 'press@6'])
  })
})
