# CALMER Hardware — Complete Testing Guide

**For the person testing the hardware.** You don't need prior knowledge of the CALMER codebase. Follow this top to bottom.

By the end, squeezing a stress ball (with a heart-rate sensor on your finger) will push live readings into the CALMER web app, where they become part of a "readiness" score.

> **Estimated time:** ~45–60 min the first time (wiring + flashing + first run). The software has **never been run with a real board before**, so budget time for small debugging.

---

## 0. TL;DR (the whole flow in one glance)

```
  [Pulse sensor] ─┐
                  ├─▶ [Arduino] ──USB serial──▶ [serial-bridge.js] ──HTTP──▶ [CALMER web app]
  [Stress ball] ──┘   (runs your          (a Node script on        POST         /api/biometric
   (pressure/FSR)      firmware)           the same PC)          /api/biometric      │
                                                                                     ▼
                                              Supabase DB: biometric_reading + emotional_state
                                                        (heart rate, grip, HRV → readiness score)
```

**Two golden rules:**
1. **The Arduino cannot talk to the web app directly.** A separate Node script (`serial-bridge.js`) reads the Arduino and forwards the data. You run the app **and** the bridge at the same time.
2. **Test the software path first with the simulator** (Section 6) — it needs no hardware and proves the app/DB side works, so when you plug in the real board you're only debugging wiring.

---

## 1. How it works (read this once)

CALMER has two modules: a venting "rage room" game and an AI therapist chat. The **hardware layer** measures the user's body while they vent, so the app can tell how activated/calm they are and time the hand-off from venting to reflection.

**Three pieces, three files (all in this `hardware/` folder + one API route):**

| Piece | File | What it does |
|---|---|---|
| **Firmware** | `calmer_sensor.ino` | Runs *on the Arduino*. Reads the two sensors and prints readings as text over USB. |
| **Bridge** | `serial-bridge.js` | Runs *on your PC* (Node). Reads the Arduino's serial text and sends it to the app as JSON. |
| **Ingest API** | `app/api/biometric/route.ts` | The app endpoint that receives readings, stores them, and folds them into the readiness score. |

**What the two sensors measure and why:**
- **Pulse sensor (on a fingertip/earlobe)** → **heart rate (BPM)** and **IBI** (inter-beat interval, the milliseconds between heartbeats). From successive IBIs the app computes **RMSSD**, a standard **Heart-Rate Variability (HRV)** metric. Higher HRV = more relaxed; lower = more stressed. HRV is the signal clinical stress datasets actually use.
- **FSR (force-sensitive resistor) inside a stress ball** → **grip pressure**. Harder squeeze = higher reading. A tense person grips harder.

**What happens to a reading:** the ingest route classifies each reading into a stress score, stores a `biometric_reading` row (with HR, grip, IBI, RMSSD), and writes an `emotional_state` snapshot whose readiness score now includes the biometric trend. That biometric signal *fuses* with the venting-intensity and text-sentiment signals — that fusion is the project's core research idea.

---

## 2. What you need

**Hardware**
- An **AVR Arduino board**: **Uno, Nano, or Pro Mini**. ⚠️ **Must be AVR.** The firmware uses AVR timer interrupts and **will not work on ESP32, ESP8266, Arduino Due, or Raspberry Pi Pico.**
- A **pulse/heart-rate sensor** (e.g., the common "PulseSensor" with 3 wires).
- An **FSR** (force-sensitive resistor) mounted in/under a **stress ball**.
- One **~10 kΩ resistor** (for the FSR voltage divider).
- Breadboard + jumper wires + a USB cable for the Arduino.

**Software**
- **Arduino IDE** — download from [arduino.cc/en/software](https://www.arduino.cc/en/software). Needed to put the firmware on the board.
- **Node.js** (already required for the app).
- The **CALMER app running** (`npm run dev`) with its database set up. *(The database migrations have already been run — you do not need to run any SQL.)*
- Two values from whoever set up the project: the app's **`HARDWARE_INGEST_SECRET`** and confirmation that **`SUPABASE_SERVICE_ROLE_KEY`** is set in the app's `.env.local`.

---

## 3. Wire the sensors

Power everything from the Arduino's **5V** and **GND** pins.

**Pulse sensor (3 wires):**
| Sensor wire | Arduino pin |
|---|---|
| Signal (often purple) | **A0** |
| VCC / + (often red) | **5V** |
| GND / − (often black) | **GND** |

**FSR (needs a voltage divider so the Arduino can read it):**
```
   5V ──[ FSR ]──┬──[ 10kΩ ]── GND
                 │
                 └────────────── A5   (Arduino reads the junction here)
```
| Connection | Arduino pin |
|---|---|
| FSR + fixed resistor junction | **A5** |
| FSR other leg | **5V** |
| Resistor other leg | **GND** |

When you press the FSR, its resistance drops and the voltage at **A5** rises — that's the grip reading.

> These pins are fixed in the firmware (`pulsePin = 0` → A0, `pressureAnalogPin = 5` → A5). Don't change the wiring pins without changing the sketch.

✅ **Checkpoint:** everything wired, nothing shorting 5V to GND, board not yet plugged into USB.

---

## 4. Flash the firmware onto the Arduino (Arduino IDE)

1. Install and open the **Arduino IDE**.
2. Plug the Arduino into USB.
3. In the IDE: **File → Open** → select `hardware/calmer_sensor.ino`.
4. **Tools → Board** → pick your board (e.g., "Arduino Uno" / "Arduino Nano").
5. **Tools → Port** → pick the port that appeared when you plugged in (e.g., **COM5** on Windows, `/dev/tty.usbmodem…` on Mac). **Write this port down — you need it later.**
6. Click **Upload** (the → arrow). Wait for "Done uploading."
7. Open **Tools → Serial Monitor**, set the baud dropdown (bottom-right) to **9600**.

You should now see lines like:
```
Pressure:87  Level:No_Pressure
Pressure:640  Level:Light_Pressure    ← appears when you squeeze
BPM:78                                 ← appears when it detects your pulse
IBI:769                                ← the gap between beats, in ms
```
- `Pressure:` prints every second. Squeeze the ball → the number rises and the Level changes.
- `BPM:` / `IBI:` only print when the sensor catches a heartbeat. Hold the pulse sensor gently against a fingertip and keep still; the onboard LED (pin 13) blinks on each beat.

> ⚠️ **The "28 problems" some editors (VS Code C/C++) show on the `.ino` are false alarms** — that tool reads Arduino code as plain C++ and doesn't understand Arduino macros. If the Arduino IDE says "Done uploading," the code is correct. Ignore the squiggles.

✅ **Checkpoint:** Serial Monitor shows `Pressure:` lines always, and `BPM:`/`IBI:` when a pulse is detected. **Now close the Serial Monitor** — only one program can use the port at a time, and the bridge needs it next.

---

## 5. Set up the software side (bridge config)

1. Make sure the **CALMER app is running** on this PC: from the repo root, `npm run dev` (it serves at `http://localhost:3000`).
2. In a terminal, go to the hardware folder and install its dependencies:
   ```bash
   cd hardware
   npm install
   ```
3. Copy the config template and edit it:
   ```bash
   cp .env.example .env
   ```
   Open `hardware/.env` and set:
   - `CALMER_API_URL=http://localhost:3000`
   - `CALMER_HARDWARE_SECRET=` → the **exact same value** as `HARDWARE_INGEST_SECRET` in the app's root `.env.local`. (Ask whoever set up the project. If they don't match, every reading is rejected with `401`.)

✅ **Checkpoint:** `hardware/.env` exists with the matching secret; `npm install` finished without errors.

---

## 6. ⭐ Test the software FIRST — no board needed (the simulator)

Do this **before** trusting the real hardware. It sends fake readings straight to the app, proving the whole software chain works. If this passes, any later failure is hardware/wiring, not software.

1. In the browser (logged into the CALMER app), open **Release Anger**, start a rage-room session, then click **Find Peace**. The URL becomes `…/chat?session=<UUID>`. **Copy that `<UUID>`.**
   *(Alternatively, in Supabase run `select id from session order by start_time desc limit 1;`.)*
2. From the `hardware/` folder, run the simulator with that UUID:
   ```bash
   npm run simulate -- --session <PASTE_UUID_HERE>
   ```
3. You should see 8 lines like:
   ```
   [sim] ok   grip=1000 bpm=125 ibi=487 -> {"stressClass":"high",...}
   [sim] ok   grip=864 bpm=118 ibi=515 -> ...
   ...
   [sim] ok   grip=50 bpm=75 ibi=812 -> {"stressClass":"low",...}
   ```
   It simulates a person calming down: grip and heart rate fall, and HRV rises.

Now verify in **Supabase → SQL Editor** (replace the UUID):
```sql
-- readings landed, with HRV
select recorded_at, heart_rate, grip_pressure, ibi, rmssd, stress_class
from public.biometric_reading
where session_id = '<UUID>' order by recorded_at;
```
```sql
-- the biometric signal fused into a readiness score
select source, stress_level, readiness_score, signals_used
from public.emotional_state
where session_id = '<UUID>' and source = 'biometric' order by recorded_at;
```

✅ **Pass looks like:**
- `biometric_reading`: one row per reading; `ibi` filled on every row; `rmssd` **null on the first row** (needs ≥2 beats), then filled and generally **rising** as the session calms; `stress_class` going `high → low`.
- `emotional_state`: rows with `source = 'biometric'` whose `signals_used` array **includes `biometricTrend`**.

If this works, the software side is proven. 🎉

---

## 7. Test with the real hardware (the bridge)

Now the real thing. Same as the simulator, but readings come from the Arduino.

1. Confirm the **Serial Monitor is closed** (Section 4).
2. App running, and a fresh rage-room session started → copy its **session UUID**.
3. From `hardware/`, run the bridge with your **COM port** and the **session UUID**:
   ```bash
   npm run bridge -- --port COM5 --session <PASTE_UUID_HERE>
   ```
   (Use your actual port from Section 4. Mac/Linux: `--port /dev/tty.usbmodem14101`.)
4. You should see:
   ```
   [bridge] serial open on COM5, session <UUID>
   [bridge] sent { session_id: '…', heart_rate: 78, grip_pressure: 640, ibi: 769 }
   ```
5. **Squeeze the stress ball** and keep the pulse sensor on your finger. Every ~2 seconds the bridge posts the latest reading.
6. Verify with the **same two SQL queries as Section 6** — you should see real `biometric_reading` rows appearing for this session.

✅ **Pass:** squeezing the ball visibly raises `grip_pressure` in the DB within a couple of seconds, and `heart_rate`/`ibi`/`rmssd` populate when the pulse is detected.

To stop: press **Ctrl+C** in the bridge terminal.

---

## 8. Troubleshooting

| What you see | Cause → fix |
|---|---|
| `[sim]`/`[bridge] FAILED 401` | `CALMER_HARDWARE_SECRET` ≠ the app's `HARDWARE_INGEST_SECRET`, **or** the app is missing `SUPABASE_SERVICE_ROLE_KEY`. Fix the secrets, restart the app. |
| `FAILED 404 Unknown session_id` | The UUID is wrong or from an old session. Start a **new** rage-room session and copy the fresh id. |
| `[sim]/[bridge] network error` | The app isn't running, or `CALMER_API_URL` is wrong. Start `npm run dev`; confirm `http://localhost:3000` loads. |
| Bridge: `serial error` / "cannot open COM5" | Wrong `--port`, **or the Arduino IDE Serial Monitor is still open** holding the port. Close it; check the port in Arduino IDE → Tools → Port. |
| `Pressure:` lines but never `BPM:`/`IBI:` | Pulse-sensor wiring or finger placement. Press it gently and stay still; watch the pin-13 LED — it should blink per beat. Pressure still works meanwhile. |
| `[bridge] ignoring implausible BPM` | Normal — the sensor dropped out (movement). It's rejecting garbage on purpose; keep still. |
| `npm install` fails in `hardware/` | Make sure you're in the `hardware/` folder (it has its own `package.json`), and Node is installed. |
| VS Code shows 28 errors in `calmer_sensor.ino` | **Ignore** — false positives from the C/C++ extension reading Arduino code. If it uploads in the Arduino IDE, it's fine. |

---

## 9. Reference

**Serial protocol** (what the Arduino prints, 9600 baud):
```
Pressure:<raw 0-1023>  Level:<No_Pressure|Light_Pressure|Medium_Pressure|High_Pressure>
BPM:<int>
IBI:<int milliseconds>
```

**What the bridge sends** to `POST /api/biometric` (header `x-hardware-secret: <secret>`):
```json
{ "session_id": "<uuid>", "heart_rate": 78, "grip_pressure": 640, "ibi": 769 }
```

**Pin map:** pulse → **A0**, FSR → **A5**, beat LED → **13**, baud **9600**.

**Pressure thresholds** (raw ADC, in the firmware): `<100` No · `<650` Light · `<950` Medium · `≥950` High. These mirror the report but were **never validated against a real ball** — if the levels feel wrong, measure your ball's no-load / light / firm / max readings in the Serial Monitor and tell the dev to adjust them.

---

## 10. Notes & known limits

- The board **must be AVR** (Uno/Nano/Pro Mini). Non-AVR boards won't compile the interrupt code.
- This chain has **never been bench-tested with a real board** — you are the first. Expect small issues; the simulator (Section 6) is your friend for isolating them.
- **Session pairing is manual** (you paste the UUID). A pair-code/QR flow is a planned improvement.
- **HRV (RMSSD) is captured but not yet used to *drive* the stress classification** — that (the full SWELL-KW model) is a later step. For now it's stored on every reading.

When you've run through Section 6 (and ideally Section 7), note down anything that broke and the exact error text — that's what the dev needs to fix it.
