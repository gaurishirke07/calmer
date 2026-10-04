// Gesture control for the rage room (roadmap C-3). Pure logic only — webcam
// capture and MediaPipe live in components/calmer/gesture-controller.tsx.
//
// Gestures are a new INPUT DEVICE, not a new signal: the hand drives the same
// cursor and the same press/release the mouse does, so every hit goes through
// fireWeapon/logInteraction exactly like a click, and the venting telemetry
// (and the readiness score built on it) is unchanged by the input method.
// Mapping: palm position aims; closing the hand into a fist is a press (one
// swing, or the saw starts); opening it is a release.

// Pinned to the installed @mediapipe/tasks-vision version — the WASM runtime is
// loaded from a CDN (34 MB; too large to commit), so it must match the JS API.
// A unit test fails if the two drift apart.
export const MEDIAPIPE_VERSION = '1.0.1'
export const MEDIAPIPE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
export const GESTURE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

export interface Point {
  x: number
  y: number
}

/**
 * The palm centre from MediaPipe's 21 hand landmarks (normalised 0..1): the mean
 * of the wrist and the index, middle and pinky knuckles — steadier than a
 * fingertip, which moves when the hand closes. x is mirrored so moving your
 * hand right moves the cursor right in a selfie view.
 */
export function palmPoint(landmarks: Point[]): Point | null {
  const idx = [0, 5, 9, 17]
  if (landmarks.length < 18) return null
  let x = 0
  let y = 0
  for (const i of idx) {
    x += landmarks[i].x
    y += landmarks[i].y
  }
  return { x: 1 - x / idx.length, y: y / idx.length }
}

/** Exponential smoothing for the aim point, to take out webcam jitter. */
export function smooth(prev: Point | null, next: Point, alpha = 0.5): Point {
  if (!prev) return next
  return { x: prev.x + alpha * (next.x - prev.x), y: prev.y + alpha * (next.y - prev.y) }
}

export const FIST_MIN_SCORE = 0.6

/** Is this frame's top gesture a confident closed fist? */
export function isFist(category: string | undefined, score: number | undefined): boolean {
  return category === 'Closed_Fist' && (score ?? 0) >= FIST_MIN_SCORE
}

export interface FistState {
  down: boolean
  openFrames: number // consecutive non-fist frames while down
  lastPressAt: number
}
export const INITIAL_FIST: FistState = { down: false, openFrames: 0, lastPressAt: -Infinity }

/**
 * One frame of the press/release state machine:
 *  - press on the open -> fist edge, at most once per `minGapMs` (no rapid-fire
 *    from a jittery fist);
 *  - holding a fist does not press again (the saw keeps running, like a held
 *    mouse button);
 *  - release only after `releaseFrames` consecutive non-fist frames, so a single
 *    misclassified frame mid-swing doesn't drop the press.
 */
export function stepFist(
  s: FistState,
  fist: boolean,
  now: number,
  { minGapMs = 250, releaseFrames = 2 } = {},
): { state: FistState; pressed: boolean; released: boolean } {
  if (!s.down) {
    if (fist && now - s.lastPressAt >= minGapMs) {
      return { state: { down: true, openFrames: 0, lastPressAt: now }, pressed: true, released: false }
    }
    return { state: s, pressed: false, released: false }
  }
  if (fist) return { state: { ...s, openFrames: 0 }, pressed: false, released: false }
  const openFrames = s.openFrames + 1
  if (openFrames >= releaseFrames) {
    return { state: { down: false, openFrames: 0, lastPressAt: s.lastPressAt }, pressed: false, released: true }
  }
  return { state: { ...s, openFrames }, pressed: false, released: false }
}
