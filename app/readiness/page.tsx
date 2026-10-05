'use client'

// Standalone explainable-readiness demo (roadmap ADD-1 / C-4).
//
// Runs a synthetic venting→calm trajectory through the REAL
// computeReadinessScore and renders the live breakdown. The signal toggles let
// you "unplug" a sensor mid-run and watch the weights renormalise over what's
// left — the graceful-degradation claim, made visible. Nothing here is mocked
// except the input trajectory; the fusion is the production code.

import { useCallback, useEffect, useState } from 'react'
import { computeReadinessScore } from '@/lib/calmer/readiness'
import { ReadinessDashboard } from '@/components/calmer/readiness-dashboard'
import { FaceTracker } from '@/components/calmer/face-tracker'
import { FaceModelPicker } from '@/components/calmer/face-model-picker'
import type { FaceModel } from '@/lib/calmer/facial-affect'
import { VoiceTracker } from '@/components/calmer/voice-tracker'

const STEPS = 26
const TICK_MS = 750
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

// Accumulated synthetic histories (chronological). All three are sampled every
// tick, so a signal toggled on mid-run already has a trend to read.
type Histories = { venting: number[]; bio: number[]; sent: number[] }
const EMPTY: Histories = { venting: [], bio: [], sent: [] }

// One step of an episode that starts activated and settles (+ a little noise).
function nextSample(h: Histories): Histories {
  const s = h.venting.length
  if (s >= STEPS) return h
  const p = s / STEPS // 0 → 1 progress through the episode
  return {
    venting: [...h.venting, Math.max(0, Math.round(92 * (1 - p) + (Math.random() * 10 - 5)))],
    bio: [...h.bio, clamp(0.9 * (1 - p) + (Math.random() * 0.08 - 0.04), 0, 1)],
    sent: [...h.sent, clamp(-0.85 + 1.5 * p + (Math.random() * 0.2 - 0.1), -1, 1)],
  }
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
        on
          ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
          : 'border-white/15 bg-white/5 text-white/40'
      }`}
    >
      {on ? '● ' : '○ '}
      {label}
    </button>
  )
}

export default function ReadinessDemoPage() {
  const [hist, setHist] = useState<Histories>(EMPTY)
  const [playing, setPlaying] = useState(true)
  const [bioOn, setBioOn] = useState(true)
  const [sentOn, setSentOn] = useState(true)
  const [timeOn, setTimeOn] = useState(true)
  // Opt-in live webcam signal, mixed into the synthetic episode. The last ~4 s
  // of readings (16 at 4 Hz); cleared when the face leaves the frame.
  const [faceOn, setFaceOn] = useState(false)
  const [faceVals, setFaceVals] = useState<number[]>([])
  const onFace = useCallback(
    (v: number | null) => setFaceVals((prev) => (v === null ? [] : [...prev, v].slice(-16))),
    [],
  )
  const toggleFace = (on: boolean) => {
    setFaceVals([])
    setFaceOn(on)
  }
  const [faceModel, setFaceModel] = useState<FaceModel>('face-api')
  const chooseFaceModel = (m: FaceModel) => {
    setFaceVals([])
    setFaceModel(m)
  }
  // Opt-in live mic signal: vocal-effort samples (last 40 = 20 s) + session peak.
  const [voiceOn, setVoiceOn] = useState(false)
  const [voice, setVoice] = useState<{ vals: number[]; peak: number }>({ vals: [], peak: 0 })
  const onVoice = useCallback(
    (v: number) => setVoice((p) => ({ vals: [...p.vals, v].slice(-40), peak: Math.max(p.peak, v) })),
    [],
  )
  const toggleVoice = (on: boolean) => {
    setVoice({ vals: [], peak: 0 })
    setVoiceOn(on)
  }

  const step = hist.venting.length
  const done = step >= STEPS
  const running = playing && !done

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setHist(nextSample), TICK_MS)
    return () => clearInterval(id)
  }, [running])

  const reset = () => {
    setHist(EMPTY)
    setPlaying(true)
  }

  const result = computeReadinessScore({
    ventingIntensities: hist.venting,
    biometricStressScores: bioOn ? hist.bio : undefined,
    sentimentScores: sentOn ? hist.sent : undefined,
    facialAffectScores: faceOn && faceVals.length ? faceVals : undefined,
    vocalIntensities: voiceOn ? voice.vals : undefined,
    vocalSessionPeak: voiceOn ? voice.peak : undefined,
    sessionDurationSeconds: timeOn ? (step / STEPS) * 150 : undefined,
  })

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-10 text-foreground">
      <h1 className="text-xl font-bold">Readiness score — live breakdown</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A synthetic venting→calm episode fed through CALMER&apos;s real fusion. Toggle a signal to
        &ldquo;unplug&rdquo; it and watch the weights renormalise over what remains.
      </p>

      {/* The panel sits on a dark card — it is styled for dark surfaces. */}
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-neutral-900 p-5 shadow-xl sm:flex-row">
        <ReadinessDashboard
          className="min-w-0 flex-1"
          contributions={result.contributions}
          readinessScore={result.readinessScore}
          stressLevel={result.stressLevel}
        />
        {(faceOn || voiceOn) && (
          <div className="flex w-full flex-col gap-2 sm:w-44 sm:shrink-0">
            {faceOn && <FaceModelPicker value={faceModel} onChange={chooseFaceModel} />}
            {faceOn && <FaceTracker key={faceModel} model={faceModel} onReading={onFace} />}
            {voiceOn && <VoiceTracker onSample={onVoice} />}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => (done ? reset() : setPlaying((v) => !v))}
          className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground"
        >
          {done ? 'Replay' : playing ? 'Pause' : 'Play'}
        </button>
        <button onClick={reset} className="rounded-lg border border-border px-4 py-1.5 text-xs font-semibold">
          Reset
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          step {step}/{STEPS}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/40">
          🔥 Venting (always on)
        </span>
        <Toggle on={bioOn} onChange={setBioOn} label="❤️ Biometrics" />
        <Toggle on={sentOn} onChange={setSentOn} label="💬 Sentiment" />
        <Toggle on={timeOn} onChange={setTimeOn} label="⏱️ Time" />
        <Toggle on={faceOn} onChange={toggleFace} label="📷 Face (live webcam)" />
        <Toggle on={voiceOn} onChange={toggleVoice} label="🎙️ Voice (live mic)" />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        The white tick on the meter is the handoff threshold (66%). Once readiness holds above it, the
        app offers to move the user from venting into reflective chat.
      </p>
    </main>
  )
}
