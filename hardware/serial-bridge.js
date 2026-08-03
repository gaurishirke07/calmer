// CALMER Serial Bridge
// Reads plain-text lines from the Arduino (hardware/calmer_sensor.ino) over
// USB serial and forwards them to the Next.js ingest endpoint as JSON.
//
// This runs as a standalone Node process on whatever machine the Arduino is
// plugged into — it is NOT part of the Next.js app build (edge/serverless
// functions can't hold a serial port open).
//
// Setup (once):
//   cd hardware
//   npm init -y
//   npm install serialport @serialport/parser-readline node-fetch@2
//
// Run:
//   node serial-bridge.js --port COM5 --session <SESSION_UUID>
//   (on Mac/Linux, port looks like /dev/tty.usbmodem14101)
//
// Env vars required:
//   CALMER_API_URL         e.g. http://localhost:3000
//   CALMER_HARDWARE_SECRET must match HARDWARE_INGEST_SECRET on the server
//
// NOTE: session pairing is manual for now (paste the session UUID from the
// browser when a Rage Room session starts). A "pair device" QR/code flow is
// a good next step once the ingest path itself is proven out.

// Fail LOUDLY if deps are missing. A silent catch here made the script
// blame a missing .env file that actually existed, because dotenv had
// never been installed. Run 'npm install' in hardware/ first.
try {
  require('dotenv').config()
} catch {
  console.warn(
    '[bridge] dotenv is not installed, so hardware/.env was NOT loaded. ' +
    'Run "npm install" inside hardware/ before using this script. ' +
    'Falling back to whatever is already in the process environment.',
  )
}
const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline')
// Node 18+ ships a global fetch — no node-fetch dependency needed.

const args = process.argv.slice(2)
function getArg(flag, fallback) {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : fallback
}

const PORT_PATH = getArg('--port', process.env.CALMER_SERIAL_PORT)
const SESSION_ID = getArg('--session', process.env.CALMER_SESSION_ID)
// Identifies THIS BOARD so its rows are distinguishable from simulated ones.
// simulate.js deliberately never sends a label, so simulated rows keep
// device_id = null while real hardware rows get a hardware_device id.
const DEVICE_LABEL = getArg('--device-label', process.env.CALMER_DEVICE_LABEL || 'arduino-uno-01')
const API_URL = process.env.CALMER_API_URL || 'http://localhost:3000'
const SECRET = process.env.CALMER_HARDWARE_SECRET

if (!PORT_PATH || !SESSION_ID || !SECRET) {
  console.error('Missing required config. Need --port, --session, and CALMER_HARDWARE_SECRET.')
  process.exit(1)
}

const PRESSURE_MAP = {
  No_Pressure: 0,
  Light_Pressure: 300,
  Medium_Pressure: 750,
  High_Pressure: 1000,
}

let latestGripPressure = null
let latestHeartRate = null
let latestIbi = null
let lastBpmTime = 0
let sendTimer = null

const port = new SerialPort({ path: PORT_PATH, baudRate: 9600 })
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))

port.on('open', () => console.log(`[bridge] serial open on ${PORT_PATH}, session ${SESSION_ID}`))
port.on('error', (err) => console.error('[bridge] serial error:', err.message))

parser.on('data', (line) => {
  line = line.trim()

  const pressureMatch = line.match(/^Pressure:(\d+)\s+Level:(\w+)/)
  if (pressureMatch) {
    const rawValue = parseInt(pressureMatch[1], 10)
    // FSR is a 10-bit ADC (0-1023); ignore out-of-range noise.
    if (rawValue >= 0 && rawValue <= 1023) {
      latestGripPressure = rawValue
      scheduleSend()
    }
    return
  }

  const bpmMatch = line.match(/^BPM:(\d+)/)
  if (bpmMatch) {
    const bpm = parseInt(bpmMatch[1], 10)
    // Reject physiologically impossible values — the pulse sensor drops out
    // constantly with hand movement, and this device is used *while venting*.
    if (bpm >= 30 && bpm <= 220) {
      latestHeartRate = bpm
      lastBpmTime = Date.now()
      scheduleSend()
    } else {
      console.warn('[bridge] ignoring implausible BPM:', bpm)
    }
    return
  }

  const ibiMatch = line.match(/^IBI:(\d+)/)
  if (ibiMatch) {
    const ibiVal = parseInt(ibiMatch[1], 10)
    // plausible inter-beat interval ~250-2000ms (≈30-240 bpm)
    if (ibiVal >= 250 && ibiVal <= 2000) {
      latestIbi = ibiVal
      scheduleSend()
    }
  }
})

// batch readings — send at most once every 2s even if lines arrive faster
function scheduleSend() {
  if (sendTimer) return
  sendTimer = setTimeout(async () => {
    sendTimer = null
    await sendReading()
  }, 2000)
}

async function sendReading() {
  // Pulse sensors drop out with movement — and this one is worn WHILE venting.
  // If no beat for >10s, mark HR/HRV unavailable instead of sending stale
  // values; the readiness score then drops biometricTrend and renormalizes
  // (graceful degradation exercised in the field).
  if (latestHeartRate !== null && Date.now() - lastBpmTime > 10000) {
    console.warn('[bridge] no pulse for >10s — marking HR/IBI unavailable')
    latestHeartRate = null
    latestIbi = null
  }

  if (latestGripPressure === null && latestHeartRate === null) return

  const payload = {
    session_id: SESSION_ID,
    heart_rate: latestHeartRate,
    grip_pressure: latestGripPressure,
    ibi: latestIbi,
    device_label: DEVICE_LABEL,
  }

  try {
    const res = await fetch(`${API_URL}/api/biometric`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hardware-secret': SECRET,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.error('[bridge] ingest failed:', res.status, await res.text())
    } else {
      console.log('[bridge] sent', payload)
    }
  } catch (err) {
    console.error('[bridge] network error:', err.message)
  }
}
