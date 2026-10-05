'use client'

// Opt-in microphone signal (roadmap C-5): vocal effort, measured live.
//
// Mount = ask for the mic and start; unmount = stop every track and close the
// audio context, so the parent's toggle fully controls the microphone. Nothing
// is recorded, transcribed, or sent anywhere: each 100 ms frame becomes one
// loudness number, frames are averaged into a 0..100 sample every 500 ms, and
// only those samples leave this component. See lib/calmer/vocal-arousal.ts.

import { useEffect, useRef, useState } from 'react'
import { rmsToDb, updateNoiseFloor, vocalIntensity } from '@/lib/calmer/vocal-arousal'

const FRAME_MS = 100
const FRAMES_PER_SAMPLE = 5 // one 0..100 sample every 500 ms

type Status = 'starting' | 'live' | 'denied' | 'unavailable'

const STATUS_TEXT: Record<Exclude<Status, 'live'>, string> = {
  starting: 'Starting microphone…',
  denied: 'Microphone blocked — allow it in the browser to use this',
  unavailable: 'No microphone available',
}

export function VoiceTracker({
  onSample,
  className = '',
}: {
  onSample: (intensity: number) => void
  className?: string
}) {
  const onSampleRef = useRef(onSample)
  const [status, setStatus] = useState<Status>('starting')
  const [level, setLevel] = useState(0)

  useEffect(() => {
    onSampleRef.current = onSample
  }, [onSample])

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let timer: ReturnType<typeof setInterval> | undefined

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // Automatic gain control would flatten loudness — the very thing being
          // measured — so it is off. Noise suppression stays on to keep fans and
          // keyboards below the speech threshold.
          audio: { autoGainControl: false, noiseSuppression: true, echoCancellation: true },
          video: false,
        })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        ctx = new AudioContext()
        await ctx.resume()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 2048
        ctx.createMediaStreamSource(stream).connect(analyser)
        const frame = new Float32Array(analyser.fftSize)
        let floor: number | null = null
        let sum = 0
        let frames = 0
        setStatus('live')

        timer = setInterval(() => {
          analyser.getFloatTimeDomainData(frame)
          let sq = 0
          for (let i = 0; i < frame.length; i++) sq += frame[i] * frame[i]
          const db = rmsToDb(Math.sqrt(sq / frame.length))
          floor = updateNoiseFloor(floor, db)
          const v = floor === null ? 0 : vocalIntensity(db, floor) // only silence so far
          setLevel(v)
          sum += v
          frames++
          if (frames >= FRAMES_PER_SAMPLE) {
            onSampleRef.current(sum / frames)
            sum = 0
            frames = 0
          }
        }, FRAME_MS)
      } catch (err) {
        if (stopped) return
        const name = (err as { name?: string })?.name
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
        console.warn('[voice-tracker] microphone unavailable:', (err as Error)?.message)
      }
    })()

    return () => {
      stopped = true
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
      ctx?.close()
    }
  }, [])

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="rounded-lg border border-white/15 bg-black/60 p-2">
        {status === 'live' ? (
          <>
            <div className="mb-1 flex items-center justify-between text-[10px] text-white/55">
              <span>Vocal effort</span>
              <span className="tabular-nums text-white/75">{Math.round(level)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-[width] duration-100"
                style={{ width: `${Math.round(level)}%`, backgroundColor: `hsl(${Math.round((1 - level / 100) * 120)},75%,52%)` }}
              />
            </div>
          </>
        ) : (
          <p className="py-1 text-center text-[10px] text-white/60">{STATUS_TEXT[status]}</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-[9px] leading-tight">
        {/* Never claim the mic is on when it isn't: red only while a stream is live. */}
        {status === 'live' ? (
          <span className="flex items-center gap-1 text-red-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" /> Mic on
          </span>
        ) : (
          <span className="text-white/40">{status === 'starting' ? 'Starting mic…' : 'Mic off'}</span>
        )}
        <span className="text-white/40">loudness only · not recorded</span>
      </div>
    </div>
  )
}
