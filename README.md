# CALMER

A two-module emotional-regulation web platform for students and young adults.

- **Module 1 — Rage Room:** a symbolic, time-limited venting game (smash a room, beat a ragdoll "buddy") that logs venting intensity rather than encouraging open-ended rage.
- **Module 2 — AI Therapist:** an LLM reflective chat that helps the user process what came up.

The research contribution is a continuous, multi-signal **readiness score** that decides *when* to hand the user from venting to reflection — fusing venting-intensity trend, biometrics (heart rate + grip pressure), text sentiment, and session duration, and **renormalizing over whatever signals are present** so it degrades gracefully when hardware isn't attached.

> **Scope:** first-level, short-term support — **not** a replacement for professional therapy, and **not** a clinical-grade device. The classifier output is treated as a noisy text-sentiment signal, not ground-truth "emotion."

## Architecture

| Layer | What it does |
|---|---|
| **Unified schema** (`scripts/003`) | `session` is the hub; `emotional_state` is the pivot (readiness snapshots); `venting_interaction` (Module 1), `therapist_convo` (Module 2), `biometric_reading` + `hardware_device` (hardware), `safety_flag` (crisis). |
| **Readiness fusion** (`lib/calmer/readiness.ts`) | `computeReadinessScore` weight-fuses available signals and renormalizes; `classifyBiometrics` maps HR/pressure to a stress score; `corroborateBiometricTransition` blocks single-threshold transitions. |
| **Sentiment** (`lib/calmer/emotion-classifier.ts`) | j-hartmann emotion classifier via the HF Inference router; loud lexicon-stub fallback (never silent). |
| **Safety** (`lib/calmer/safety.ts`) | Layered crisis detection: lexical pre-filter + LLM risk check, combined conservatively; safety-mode reply and a persisted `safety_flag`. |
| **Cross-module fusion** | One `session` spans venting **and** chat: the rage room's `session_id` is carried into `/chat?session=...`, so chat readiness fuses venting history with text sentiment. |
| **Hardware** (`hardware/`) | Arduino (pulse + FSR) → `serial-bridge.js` → `/api/biometric`. Inter-beat intervals become a rolling RMSSD. |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind + shadcn/ui · Supabase (Postgres + Auth + RLS) · Vercel AI SDK v6 · Llama-3.3-70B via **Groq** (OpenAI-compatible API) · j-hartmann classifier via the Hugging Face Inference router · Vitest · ESLint (eslint-config-next).

## Prerequisites

- Node.js 20+ (developed on 24)
- A Supabase project
- A **Groq** API key (the chat model)
- A **Hugging Face** token (the sentiment classifier only)

## Setup

1. **Install** (the React 19 ecosystem needs legacy peer resolution):
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Environment** — copy the template and fill in real values:
   ```bash
   cp .env.example .env.local
   ```
   `.env.local` is gitignored — never commit real keys, especially `SUPABASE_SERVICE_ROLE_KEY`. Do **not** leave placeholder duplicates in the file; dotenv keeps the last value.

3. **Database** — run all ten migrations **in numeric order** in the Supabase SQL editor:
   ```
   001_create_calmer_tables.sql          # original tables
   002_upgrade_calmer_schema.sql         # user_memories + mood logs
   003_calmer_unified_schema.sql         # unified entity model (the paper's schema)
   004_add_signals_used.sql              # signals_used / using_stub_signals
   005_drop_game_sessions.sql            # retire legacy game table
   006_session_chat_metadata.sql         # title / summary / mood on session
   007_drop_legacy_chat_tables.sql       # retire legacy chat + mood tables
   008_biometric_hrv.sql                 # ibi + rolling rmssd
   009_session_mrt_condition.sql         # micro-randomised trial assignment
   010_emotional_state_corroborated.sql  # biometric corroboration outcome
   ```
   Then confirm RLS: as user A you must not be able to read user B's `session` rows.

4. **Hardware (optional)** — `hardware/` needs its own env file:
   ```bash
   cp hardware/.env.example hardware/.env
   ```
   `CALMER_HARDWARE_SECRET` there **must match** `HARDWARE_INGEST_SECRET` in `.env.local`, or the bridge and simulator get a 401. You can exercise the whole sensing path with no board attached:
   ```bash
   node hardware/simulate.js --session <SESSION_UUID>
   ```
   See `hardware/TESTING.md` for the real-board procedure.

## Running

```bash
npm run dev
```
Walk the flow: sign up → rage room → **Find Peace** → chat → dashboard. Watch both the browser console and the `next dev` terminal — DB write failures log via `console.error` rather than throwing.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unit) |
| `npm run test:watch` | Vitest watch mode |

## Testing

24 unit tests cover the pure logic the research claim rests on — score bounds, weight renormalization over any subset of signals, honest reporting of which signals contributed, biometric classification bands, RMSSD, the layered safety combination, and the biometric corroboration rule. No DB or network required. Add tests alongside the code as `*.test.ts`.

## CI

`.github/workflows/ci.yml` runs typecheck → lint → test → build on every push/PR to `main`. The build step uses throwaway Supabase env values (no secrets in CI).

## Deployment (Vercel)

Import the GitHub repo into Vercel and set the environment variables from `.env.example` in the project settings (`SUPABASE_SERVICE_ROLE_KEY` server-only). Next.js is auto-detected; no extra config needed.

## Project structure

```
app/            App Router pages + API routes (chat, biometric, sessions, …)
components/     game/ (rage room), chat/, dashboard/, analytics/, ui/ (shadcn)
lib/calmer/     readiness fusion + emotion classifier (the research core)
lib/supabase/   client / server / service-role clients
lib/services/   memory, analytics, emotion, session helpers
scripts/        SQL migrations (run 001 → 010 in order)
hardware/       Arduino sketch + serial bridge
```
