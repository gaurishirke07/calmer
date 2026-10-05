'use client'

// Opt-in webcam facial-expression signal (roadmap C-2).
//
// Mount = ask for the camera and start; unmount = stop every track. The parent
// renders this only while the user has the toggle on, so the camera can never
// be left running by a stale component. Everything happens on this device:
// frames never leave the browser and are never stored — only the derived
// valence number is passed up, and from there into the readiness score (each
// snapshot stores that value and which model produced it).
//
// Two expression models, same output scale (lib/calmer/facial-affect.ts):
//   'face-api' — fast and tiny (0.5 MB, served from /public), ~4 readings/s
//   'vit'      — research-grade Hugging Face ViT via transformers.js (~57 MB,
//                cached after the first load), ~1 reading/s on the face crop
// face-api's detector finds the face in both cases.
//
// Treat the output as a NOISY signal [Barrett et al. 2019].

import { useEffect, useRef, useState } from 'react'
import { facialValence, labelScoresToExpressions, topExpression, type FaceModel } from '@/lib/calmer/facial-affect'
import { loadVitFace } from './vit-face'

const MODEL_URL = '/models/face'
const DETECT_EVERY_MS = 250
const VIT_EVERY_MS = 1000 // the ViT is ~100x larger; once a second is plenty

type Status = 'loading' | 'running' | 'no-face' | 'denied' | 'unavailable'

export function FaceTracker({
  onReading,
  model = 'face-api',
  className = '',
}: {
  // valence -1..1 on each reading; null on a tick with no face in view
  onReading: (valence: number | null) => void
  model?: FaceModel
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onReadingRef = useRef(onReading)
  const [status, setStatus] = useState<Status>('loading')
  const [progress, setProgress] = useState<number | null>(null)
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
        // Loaded on demand so nothing ships to users who don't turn the camera on.
        const faceapi = await import('@vladmandic/face-api')
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          model === 'face-api' ? faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL) : Promise.resolve(),
        ])
        const vit =
          model === 'vit'
            ? await loadVitFace((p) => {
                if (!stopped) setProgress(p)
              })
            : null
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
        const crop = document.createElement('canvas')
        crop.width = 224
        crop.height = 224
        let lastVit = 0

        const tick = async () => {
          if (stopped) return
          let box: { x: number; y: number; width: number; height: number } | null = null
          let expressions: Record<string, number> | null = null

          if (vit) {
            const det = await faceapi.detectSingleFace(video, options)
            if (det) {
              box = det.box
              if (Date.now() - lastVit >= VIT_EVERY_MS) {
                lastVit = Date.now()
                // Square crop around the face, a little margin, at the ViT's 224 px.
                const side = Math.max(box.width, box.height) * 1.2
                const cx = box.x + box.width / 2
                const cy = box.y + box.height / 2
                crop.getContext('2d')?.drawImage(video, cx - side / 2, cy - side / 2, side, side, 0, 0, 224, 224)
                expressions = labelScoresToExpressions(await vit.classify(crop))
              }
            }
          } else {
            const result = await faceapi.detectSingleFace(video, options).withFaceExpressions()
            if (result) {
              box = result.detection.box
              expressions = result.expressions as unknown as Record<string, number>
            }
          }
          if (stopped) return

          const canvas = canvasRef.current
          const ctx = canvas?.getContext('2d')
          if (canvas && ctx) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.clearRect(0, 0, canvas.width, canvas.height)
          }
          if (box) {
            if (expressions) {
              const valence = facialValence(expressions)
              if (valence !== null) onReadingRef.current(valence)
              setLabel(topExpression(expressions))
            }
            setStatus('running')
            if (canvas && ctx) {
              // The video is mirrored with CSS (selfie view); mirror the box's x
              // to match, but draw the text unmirrored so it stays readable.
              const { x, y, width, height } = box
              const mx = canvas.width - x - width
              ctx.lineWidth = 2
              ctx.strokeStyle = 'rgba(255,255,255,0.9)'
              ctx.strokeRect(mx, y, width, height)
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
  }, [model])

  const statusText =
    status === 'loading'
      ? model === 'vit'
        ? `Loading Hugging Face ViT${progress !== null ? ` ${progress}%` : ''} (≈57 MB, first time only)…`
        : 'Loading face model…'
      : status === 'no-face'
        ? 'No face in view'
        : status === 'denied'
          ? 'Camera blocked — allow it in the browser to use this'
          : status === 'unavailable'
            ? 'Camera or model unavailable'
            : ''

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-white/15 bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {status !== 'running' && (
          <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] text-white/60">
            {statusText}
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
          {model === 'vit' ? 'ViT reads' : 'Reads'} <span className="font-semibold text-white/80">{label.label}</span>{' '}
          {Math.round(label.score * 100)}% — a noisy signal, not your emotion.
        </p>
      )}
    </div>
  )
}
