'use client'

// Gesture control for the rage room (roadmap C-3): smash with your hand.
//
// Mount = start the camera and MediaPipe's gesture recogniser; unmount = stop
// every track and free the recogniser, so the parent's toggle fully controls
// the camera. Frames stay on this device. The output is only an aim point and
// press/release events — the game feeds them into the SAME cursor and
// fireWeapon path the mouse uses, so venting telemetry is unchanged by the
// input method. See lib/calmer/gesture-input.ts.

import { useEffect, useRef, useState } from 'react'
import {
  GESTURE_MODEL_URL,
  INITIAL_FIST,
  MEDIAPIPE_WASM_URL,
  isFist,
  palmPoint,
  smooth,
  stepFist,
  type Point,
} from '@/lib/calmer/gesture-input'

const FRAME_MS = 50 // ~20 recognitions/s: responsive, without starving the game canvas

type Status = 'loading' | 'live' | 'no-hand' | 'denied' | 'unavailable'

const STATUS_TEXT: Record<Exclude<Status, 'live'>, string> = {
  loading: 'Loading hand tracking…',
  'no-hand': 'Show your hand to the camera',
  denied: 'Camera blocked — allow it in the browser to use this',
  unavailable: 'Hand tracking unavailable (needs a camera and an internet connection)',
}

const GESTURE_LABEL: Record<string, string> = {
  Closed_Fist: '✊ Fist — smashing',
  Open_Palm: '✋ Open hand — aiming',
  Pointing_Up: '☝️ Aiming',
  Victory: '✌️ Aiming',
  Thumb_Up: '👍 Aiming',
  Thumb_Down: '👎 Aiming',
  ILoveYou: '🤟 Aiming',
}

export function GestureController({
  onAim,
  onPress,
  onRelease,
  className = '',
}: {
  onAim: (p: Point) => void // normalised 0..1, already mirrored for a selfie view
  onPress: (p: Point) => void
  onRelease: () => void
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handlers = useRef({ onAim, onPress, onRelease })
  const [status, setStatus] = useState<Status>('loading')
  const [gesture, setGesture] = useState<string | null>(null)

  useEffect(() => {
    handlers.current = { onAim, onPress, onRelease }
  }, [onAim, onPress, onRelease])

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let recognizer: { close(): void } | null = null
    let fist = INITIAL_FIST
    let aim: Point | null = null

    ;(async () => {
      try {
        const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision')
        const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL)
        const make = (delegate: 'GPU' | 'CPU') =>
          GestureRecognizer.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: GESTURE_MODEL_URL, delegate },
            runningMode: 'VIDEO',
            numHands: 1,
          })
        // GPU where available; some browsers/drivers refuse it, so fall back.
        const rec = await make('GPU').catch(() => make('CPU'))
        recognizer = rec
        if (stopped) {
          rec.close()
          return
        }
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

        const tick = () => {
          if (stopped) return
          const result = rec.recognizeForVideo(video, performance.now())
          const hand = result.landmarks?.[0]
          const top = result.gestures?.[0]?.[0]
          const canvas = canvasRef.current
          const ctx = canvas?.getContext('2d')
          if (canvas && ctx) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.clearRect(0, 0, canvas.width, canvas.height)
          }
          const palm = hand ? palmPoint(hand) : null
          if (palm) {
            aim = smooth(aim, palm)
            handlers.current.onAim(aim)
            const step = stepFist(fist, isFist(top?.categoryName, top?.score), performance.now())
            fist = step.state
            if (step.pressed) handlers.current.onPress(aim)
            if (step.released) handlers.current.onRelease()
            setGesture(top?.categoryName ?? null)
            setStatus('live')
            if (canvas && ctx && hand) {
              // landmarks are in camera space; mirror x to match the selfie video
              ctx.fillStyle = fist.down ? '#ff5544' : '#7dd3fc'
              for (const l of hand) {
                ctx.beginPath()
                ctx.arc((1 - l.x) * canvas.width, l.y * canvas.height, 3, 0, Math.PI * 2)
                ctx.fill()
              }
            }
          } else {
            // Hand gone: never leave a smash "held" with nobody holding it.
            if (fist.down) {
              fist = { ...INITIAL_FIST, lastPressAt: fist.lastPressAt }
              handlers.current.onRelease()
            }
            setGesture(null)
            setStatus('no-hand')
          }
          timer = setTimeout(tick, FRAME_MS)
        }
        tick()
      } catch (err) {
        if (stopped) return
        const name = (err as { name?: string })?.name
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
        console.warn('[gesture-controller] unavailable:', (err as Error)?.message)
      }
    })()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
      recognizer?.close()
      handlers.current.onRelease() // never leave the game holding a press
    }
  }, [])

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-white/15 bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {status !== 'live' && (
          <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] text-white/60">
            {STATUS_TEXT[status]}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-[9px] leading-tight">
        {status === 'live' || status === 'no-hand' ? (
          <span className="flex items-center gap-1 text-red-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" /> Camera on
          </span>
        ) : (
          <span className="text-white/40">{status === 'loading' ? 'Starting camera…' : 'Camera off'}</span>
        )}
        <span className="text-white/40">on this device</span>
      </div>
      <p className="text-[10px] text-white/55">
        {gesture && GESTURE_LABEL[gesture] ? GESTURE_LABEL[gesture] : 'Make a fist to smash · open your hand to stop'}
      </p>
    </div>
  )
}
