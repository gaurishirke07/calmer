'use client'

// Opt-in webcam facial-expression signal (roadmap C-2).
//
// Mount = ask for the camera and start; unmount = stop every track. The parent
// renders this only while the user has the toggle on, so the camera can never
// be left running by a stale component. Everything happens on this device:
// the models are served from /public, frames never leave the browser and are
// never stored — only the derived valence number is passed up, and from there
// only into the readiness score (signals_used records that it contributed).
//
// Detection runs ~4x/second, not per frame, so it doesn't fight the rage-room
// canvas for the GPU. Treat the output as a NOISY signal [Barrett et al. 2019];
// see lib/calmer/facial-affect.ts.

import { useEffect, useRef, useState } from 'react'
import { facialValence, topExpression } from '@/lib/calmer/facial-affect'

const MODEL_URL = '/models/face'
const DETECT_EVERY_MS = 250

type Status = 'loading' | 'running' | 'no-face' | 'denied' | 'unavailable'

const STATUS_TEXT: Record<Exclude<Status, 'running'>, string> = {
  loading: 'Loading face model…',
  'no-face': 'No face in view',
  denied: 'Camera blocked — allow it in the browser to use this',
  unavailable: 'No camera available',
}

export function FaceTracker({
  onReading,
  className = '',
}: {
  // valence -1..1 on each detection; null on a tick with no face in view
  onReading: (valence: number | null) => void
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onReadingRef = useRef(onReading)
  const [status, setStatus] = useState<Status>('loading')
  const [label, setLabel] = useState<{ label: string; score: number } | null>(null)

  // Keep the latest callback without restarting the camera on every render.
  useEffect(() => {
    onReadingRef.current = onReading
  }, [onReading])

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    ;(async () => {
      try {
        // Loaded on demand so the ~1 MB library never ships to users who
        // don't turn the camera on.
        const faceapi = await import('@vladmandic/face-api')
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ])
        if (stopped) return
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
          audio: false,
        })
        const video = videoRef.current
        if (stopped || !video) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.srcObject = stream
        await video.play()
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })

        const tick = async () => {
          if (stopped) return
          const result = await faceapi.detectSingleFace(video, options).withFaceExpressions()
          if (stopped) return
          const canvas = canvasRef.current
          const ctx = canvas?.getContext('2d')
          if (canvas && ctx) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.clearRect(0, 0, canvas.width, canvas.height)
          }
          if (result) {
            const expressions = result.expressions as unknown as Record<string, number>
            const valence = facialValence(expressions)
            const top = topExpression(expressions)
            if (valence !== null) onReadingRef.current(valence)
            setLabel(top)
            setStatus('running')
            if (canvas && ctx) {
              // The video is mirrored with CSS (selfie view); mirror the box's x
              // to match, but draw the text unmirrored so it stays readable.
              const { x, y, width, height } = result.detection.box
              const mx = canvas.width - x - width
              ctx.lineWidth = 2
              ctx.strokeStyle = 'rgba(255,255,255,0.9)'
              ctx.strokeRect(mx, y, width, height)
              if (top) {
                const text = `${top.label} ${Math.round(top.score * 100)}%`
                ctx.font = 'bold 13px system-ui, sans-serif'
                const tw = ctx.measureText(text).width
                ctx.fillStyle = 'rgba(0,0,0,0.65)'
                ctx.fillRect(mx, Math.max(0, y - 20), tw + 10, 18)
                ctx.fillStyle = '#fff'
                ctx.fillText(text, mx + 5, Math.max(13, y - 6))
              }
            }
          } else {
            onReadingRef.current(null)
            setLabel(null)
            setStatus('no-face')
          }
          timer = setTimeout(tick, DETECT_EVERY_MS)
        }
        tick()
      } catch (err) {
        if (stopped) return
        const name = (err as { name?: string })?.name
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
        console.warn('[face-tracker] camera/model unavailable:', (err as Error)?.message)
      }
    })()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-white/15 bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {status !== 'running' && (
          <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] text-white/60">
            {STATUS_TEXT[status]}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-[9px] leading-tight">
        {/* A privacy indicator must never claim the camera is on when it isn't:
            red only while a stream is actually live. */}
        {status === 'running' || status === 'no-face' ? (
          <span className="flex items-center gap-1 text-red-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" /> Camera on
          </span>
        ) : (
          <span className="text-white/40">{status === 'loading' ? 'Starting camera…' : 'Camera off'}</span>
        )}
        <span className="text-white/40">on this device · nothing stored</span>
      </div>
      {label && status === 'running' && (
        <p className="text-[10px] text-white/55">
          Reads <span className="font-semibold text-white/80">{label.label}</span> — a noisy signal, not your
          emotion.
        </p>
      )}
    </div>
  )
}
