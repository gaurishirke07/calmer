# CALMER Hardware Layer

Pulse sensor + pressure-sensing stress ball (FSR) → readiness fusion.

```
 Arduino + sensors  ──USB serial (9600)──▶  serial-bridge.js  ──HTTP POST──▶  /api/biometric
 (calmer_sensor.ino)      COM port          (Node, on your PC)   x-hardware-secret   │
                                                                                      ▼
                                                     biometric_reading + emotional_state (readiness fuses biometricTrend)
```

The web app **cannot** read a USB serial port directly, so `serial-bridge.js` is a **separate Node process** that reads the Arduino and forwards readings to the app. You run the app **and** the bridge at the same time.

---

## Prerequisites

- **Arduino IDE** (or `arduino-cli`) — to upload `calmer_sensor.ino` onto the board. Required once.
- An **AVR** board — **Uno / Nano / Pro Mini**. ⚠️ The sketch uses Timer2 interrupts (`TCCR2A` etc.) and **will not work on ESP32 / Due / most non-AVR boards.**
- A pulse sensor and an FSR (force-sensitive resistor) in a stress ball, with a divider resistor.
- Node.js (already installed for the app).

## Config (do this once)

**1. App side** — in the repo root `.env.local`, set both (still placeholders):
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Settings → API → `service_role` secret.
- `HARDWARE_INGEST_SECRET` — any random string you make up.

Also run `scripts/008_biometric_hrv.sql` in Supabase if you haven't — it adds the `ibi`/`rmssd` (HRV) columns the ingest route now writes.

**2. Bridge side** — in this folder:
```bash
cp .env.example .env      # then edit .env
```
Set `CALMER_HARDWARE_SECRET` to the **same** value as `HARDWARE_INGEST_SECRET` above, and `CALMER_API_URL=http://localhost:3000`.

**3. Install the bridge deps:**
```bash
npm install
```

---

## ✅ Test the software chain FIRST — no board needed (the simulator)

Do this before wiring anything. It proves the ingest path (bridge → `/api/biometric` → DB → readiness) works, so later you're only debugging hardware, not code.

1. Start the app (`npm run dev` in the repo root).
2. In the browser, start a **rage-room session** and copy its session UUID (from the `/chat?session=…` URL after "Find Peace", or from the newest `session` row in Supabase).
3. Run the simulator:
```bash
npm run simulate -- --session <SESSION_UUID>
```
It sends 8 fake readings (grip + HR falling, i.e. calming). You should see `[sim] ok …` lines.

**Verify in Supabase:**
```sql
select recorded_at, heart_rate, grip_pressure, ibi, rmssd, stress_class
from public.biometric_reading
where session_id = '<SESSION_UUID>' order by recorded_at;
```
```sql
select source, stress_level, readiness_score, signals_used
from public.emotional_state
where session_id = '<SESSION_UUID>' and source = 'biometric' order by recorded_at;
```
✅ Pass = `biometric_reading` rows appear, and `emotional_state` rows with `source='biometric'` whose `signals_used` includes `biometricTrend`. If this works, the whole software side is proven.

---

## Test with real hardware

1. **Wire it:** pulse sensor signal → **A0**, FSR → **A5** (with divider resistor), shared ground.
2. **Upload firmware:** open `calmer_sensor.ino` in the Arduino IDE → select your board + port → **Upload**.
3. **Confirm the sensor output:** open the Serial Monitor at **9600 baud** — you should see `Pressure:<n>  Level:<…>` every second and `BPM:<n>` when it detects your pulse. (Close the Serial Monitor before running the bridge — only one program can hold the port.)
4. **Find the COM port** (Arduino IDE → Tools → Port, or Windows Device Manager; e.g. `COM5`).
5. **Run the bridge** (app running + a rage-room session open):
```bash
npm run bridge -- --port COM5 --session <SESSION_UUID>
```
6. Squeeze the ball → `[bridge] sent …` lines → the same DB rows as the simulator test.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `[sim]/[bridge] FAILED 401` | `CALMER_HARDWARE_SECRET` ≠ `HARDWARE_INGEST_SECRET`, or the app is missing `SUPABASE_SERVICE_ROLE_KEY` |
| `FAILED 404 Unknown session_id` | wrong/expired session UUID — start a fresh rage-room session and use its id |
| `network error` | the app isn't running, or `CALMER_API_URL` is wrong |
| bridge: `serial error` / can't open port | wrong `--port`, or the Serial Monitor is still open holding the port |
| No `BPM:` lines | pulse sensor wiring/placement; pressure lines should still appear |

## Notes / next steps

- **HRV is now captured.** The sketch emits `IBI:`, the bridge forwards it, and `/api/biometric` stores each `ibi` plus a rolling **RMSSD** on `biometric_reading` (migration `008`). The remaining step is using RMSSD to *drive* the stress classification (the SWELL-KW model) rather than just storing it.
- Session pairing is manual (paste the UUID). A pair-code/QR flow is a future improvement.
- FSR thresholds (100/650/950) mirror the report but were never validated against a real ball — measure and tune.
