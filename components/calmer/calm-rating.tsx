'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * "How calm do you feel right now?" 0–10, saved to self_report (migration 017).
 * Shown when the venting phase ends, in BOTH trial arms: it is the trial's
 * recommended primary outcome (paper/MRT-PROTOCOL.md §5) and the label for
 * learning the readiness weights (§9). Optional, one tap, never repeated for
 * the same moment. Renders nothing without a session (signed-out play).
 */
export function CalmRating({
  sessionId,
  moment = 'after_venting',
}: {
  sessionId: string | null
  moment?: 'after_venting' | 'after_chat'
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'unavailable'>('idle')
  const [picked, setPicked] = useState<number | null>(null)

  if (!sessionId || state === 'unavailable') return null

  const rate = async (calm: number) => {
    setPicked(calm)
    setState('saving')
    const { error } = await createClient().from('self_report').insert({ session_id: sessionId, moment, calm })
    if (!error) return setState('saved')
    // Table not created yet (migration 017): quietly hide instead of nagging.
    if (error.code === 'PGRST205' || error.code === '42P01') return setState('unavailable')
    console.error('[calm-rating] failed to save:', error.message)
    setState('error')
  }

  if (state === 'saved') {
    return <p className="text-sm text-emerald-300/90">Thanks — noted ({picked}/10).</p>
  }

  return (
    <div className="w-full max-w-md space-y-2">
      <p id="calm-rating-q" className="text-center text-sm text-white/75">
        How calm do you feel right now?
      </p>
      <div role="radiogroup" aria-labelledby="calm-rating-q" className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={picked === n}
            aria-label={`${n} out of 10`}
            disabled={state === 'saving'}
            onClick={() => rate(n)}
            className={`rounded-md border py-1.5 text-xs font-bold transition-colors ${
              picked === n ? 'border-white bg-white/25 text-white' : 'border-white/20 bg-white/5 text-white/70 hover:bg-white/15'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-white/40">
        <span>not at all</span>
        <span>completely</span>
      </div>
      {state === 'error' && <p className="text-center text-xs text-red-300">Couldn&apos;t save that — tap again to retry.</p>}
    </div>
  )
}
