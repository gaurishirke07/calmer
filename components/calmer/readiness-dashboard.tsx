'use client'

// Explainable-readiness panel (roadmap ADD-1 / C-4).
//
// The readiness score is the paper's core contribution, and until now it ran
// invisibly. This renders the live breakdown that `computeReadinessScore`
// already returns in `contributions`: every signal's raw value, its renormalised
// weight, and what it contributed to the fused score — plus the handoff
// threshold. It is purely presentational (no fetching, no logic) so the same
// panel works during venting, during chat, or in a standalone demo. New
// modalities (voice, facial affect) appear here automatically once they feed a
// signal — nothing to wire per modality.
//
// Content-only (no outer card background) so it drops into any container.

import type { SignalContribution, StressLevel } from '@/lib/calmer/readiness'

const SIGNAL_META: Record<SignalContribution['key'], { label: string; blurb: string; icon: string }> = {
  ventingTrend: { label: 'Venting', blurb: 'intensity falling from the session peak', icon: '🔥' },
  biometricTrend: { label: 'Biometrics', blurb: 'heart rate + grip returning to baseline', icon: '❤️' },
  sentiment: { label: 'Sentiment', blurb: 'text turning less negative', icon: '💬' },
  facialAffect: { label: 'Face', blurb: 'opt-in webcam expression, processed on this device', icon: '🙂' },
  voiceTrend: { label: 'Voice', blurb: 'opt-in vocal effort falling from its peak, processed on this device', icon: '🎙️' },
  sessionContext: { label: 'Time', blurb: 'elapsed session context', icon: '⏱️' },
}

// 0 (activated/red) → 1 (calm/green), matching the game's existing meter.
const hue = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 120)

const STRESS_LABEL: Record<StressLevel, string> = { low: 'Calm', moderate: 'Settling', high: 'Activated' }

export function ReadinessDashboard({
  contributions,
  readinessScore,
  stressLevel,
  threshold = 0.66,
  className = '',
}: {
  contributions: SignalContribution[]
  readinessScore: number
  stressLevel: StressLevel
  threshold?: number
  className?: string
}) {
  const pct = Math.round(readinessScore * 100)
  const activeCount = contributions.filter((c) => c.active).length
  // Elapsed time is a modifier, not evidence of calm: with nothing else present
  // the score is held at neutral (see computeReadinessScore). Say so on screen,
  // otherwise "Time · weight 100%" beside a 50% score looks like an error.
  const timeOnly = activeCount > 0 && contributions.every((c) => !c.active || c.key === 'sessionContext')

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Score header */}
      <div className="flex items-end justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/55">Readiness</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-lg font-black leading-none" style={{ color: `hsl(${hue(readinessScore)},80%,62%)` }}>
            {pct}%
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
            {STRESS_LABEL[stressLevel]}
          </span>
        </span>
      </div>

      {/* Fused meter with the handoff threshold marked */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: `hsl(${hue(readinessScore)},80%,55%)` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-white/70"
          style={{ left: `${Math.round(threshold * 100)}%` }}
          title={`handoff at ${Math.round(threshold * 100)}%`}
        />
      </div>

      {/* Per-signal breakdown: raw value bar + renormalised weight */}
      <div className="space-y-1.5 pt-0.5">
        {contributions.map((c) => {
          const meta = SIGNAL_META[c.key]
          const v = c.value ?? 0
          return (
            <div key={c.key} className="flex items-center gap-2" title={meta.blurb}>
              <span className="w-4 text-center text-[11px] leading-none" style={{ opacity: c.active ? 1 : 0.3 }}>
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-[10px] leading-tight">
                  <span className={c.active ? 'text-white/75' : 'text-white/30'}>{meta.label}</span>
                  <span className={c.active ? 'text-white/45' : 'text-white/25'}>
                    {c.active ? `weight ${Math.round(c.effectiveWeight * 100)}%` : 'no signal'}
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: c.active ? `${Math.round(v * 100)}%` : '0%',
                      backgroundColor: `hsl(${hue(v)},70%,52%)`,
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {contributions.length === 0 ? (
        <p className="text-[9px] leading-tight text-white/35">Waiting for the first reading…</p>
      ) : timeOnly ? (
        <p className="text-[9px] leading-tight text-amber-200/70">
          Only elapsed time so far — time alone can&apos;t declare calm, so the score holds at neutral until a real
          signal (venting, biometrics, text, or face) arrives.
        </p>
      ) : (
        <p className="text-[9px] leading-tight text-white/35">
          {activeCount} of {contributions.length} signals active · weights renormalised over what&apos;s present, so the score still works
          if any sensor is unplugged.
        </p>
      )}
    </div>
  )
}
