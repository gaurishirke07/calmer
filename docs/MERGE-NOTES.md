# CALMER — merged build (v1 + v2)

Merged 23 Jul 2026 from `CALMER-rageroom__1_.zip` (**v1**) and `CALMER-rageroom-fixed.zip` (**v2**).

**Nothing was deleted.** Where the two versions genuinely conflicted, v1 is active and v2's variant is preserved in `_v2-reference/` as `.bak` (so Next.js won't compile it).

---

## What each version actually was

The name "fixed" is misleading. The two versions diverged in **opposite directions** — v2 is not a superset of v1.

**v1 = the feature-rich product.** Roughly 395 more lines of game code and eight extra API routes.
- Game: 6 weapons (bat, gun, shotgun, grenade, molotov, chainsaw), 4 room themes (classroom, office, livingroom, kitchen), pseudo-3D projection, fire pools, ragdoll face expressions, 960×560 canvas. **This is the version matching the report screenshots (Fig 6.3).**
- Session history: `/api/sessions`, `[id]`, `[id]/summary` + `chat-sidebar.tsx`
- Memory system: `/api/memories` + `lib/services/memory.ts`
- **Mood analytics**: `/api/analytics` + `components/analytics/mood-analytics.tsx` ← the "emotion-trajectory visualisation" from the backlog is *already built here*
- Settings page + GDPR export/delete (`/api/user/export`, `/api/user/delete`)
- Richer CSS (268L vs 160L), landing background, fuller home sections
- Chat: Google Gemini + memory injection + emotion detection

**v2 = the CALMER research layer.** Thinner UI, but it contains the novelty implementation.
- `lib/calmer/readiness.ts` — `computeReadinessScore`, `detectSafetyTrigger`, `stubTextSentiment`
- `lib/calmer/emotion-classifier.ts` — j-hartmann classifier
- `scripts/002_calmer_unified_schema.sql` — the unified entity model (session, hardware_device, biometric_reading, emotional_state, venting_interaction, therapist_convo, safety_flag)
- `app/api/biometric/route.ts` — hardware ingest
- `hardware/` — Arduino sketch + serial bridge
- `lib/supabase/service.ts` — service-role client
- Chat: Llama-3.3-70B via HF router + readiness + safety hooks
- **Its game is simpler (3 weapons, 1 room) but it is the only one wired to the unified schema.**

## Verdict: which is better at what

| Area | Better | Why |
|---|---|---|
| Game visuals / play | **v1** | 6 weapons vs 3, 4 rooms vs 1, 3D projection, fire, expressions |
| Game *telemetry* | **v2** | only version writing `venting_interaction` + `emotional_state` + readiness |
| Chat UI | **v1** | sidebar, session history, memory |
| Chat backend | **tie** | v1 = Gemini + memory; v2 = Llama + readiness/safety. Different goals |
| Analytics / settings / GDPR | **v1** | v2 has none of it |
| Hardware | **v2** | v1 has none |
| Research novelty | **v2** | readiness fusion + unified schema = the paper's claim |
| Report fidelity | **v1** | screenshots in the report show v1's game |

---

## What this merge did

1. **Base = v1** (all 124 files, minus `.git`, `.next`, `node_modules`, `.env.local`, `tsconfig.tsbuildinfo`).
2. **Added v2's 7 unique files** — `lib/calmer/*`, `lib/supabase/service.ts`, `app/api/biometric/route.ts`, `hardware/*`.
3. **Schemas are complementary, not conflicting** — v1's `002` extends the original `001` tables (adds `user_memories`, `mood_logs`); v2's creates the new unified entity model. v2's was renumbered to **`003_calmer_unified_schema.sql`** so it runs after. Run in order: `001 → 002 → 003`.
4. **package.json** — kept both `@ai-sdk/google` (v1, needed for Gemini) and `@ai-sdk/openai` at the higher `^3.0.86`.
5. **Conflicting files preserved** in `_v2-reference/`:
   - `anger-release-game.v2-telemetry.tsx.bak`
   - `therapist-chat.v2-unified.tsx.bak`
   - `chat-route.v2-llama.ts.bak`
   - `globals.v2.css.bak`

---

## Deferred — NOT done here, by request

The lit-review-driven changes (dead HF endpoint, stub safety detector, JITAI reframing, hardcoded 988, cross-session fusion, etc.) were **not** applied.

**One additional merge task was also deliberately left undone**, and it's the important one:

> **Graft v2's telemetry into v1's game.** v1 has the rich game; v2 has the CALMER wiring. Right now v1's game only writes to the legacy `game_sessions` table — so the merged build has `readiness.ts` present but *not called from the game*.
>
> The graft is ~60 additive lines into v1's 1080-line canvas component: import `createClient` + `computeReadinessScore`, add `sessionIdRef` / `gameStartTimeRef`, create a `session` row on start, batch-flush `venting_interaction` rows on destroy events, then recompute readiness and insert `emotional_state`. Copy the pattern from `_v2-reference/anger-release-game.v2-telemetry.tsx.bak` (lines ~132, ~435–470).

I did **not** attempt this blind. It's additive but touches a large canvas component that has never been run, and a silent break there would cost more than it saves. Do it with the app running.

**Consequence to be aware of:** until that graft is done, the merged build has v1's features *and* v2's modules, but the novelty-claim data path (venting → readiness → emotional_state) is only exercised by the reference file, not by the active game.

## Env vars needed

From v1: Supabase URL/anon key, `GOOGLE_GENERATIVE_AI_API_KEY`.
From v2: `SUPABASE_SERVICE_ROLE_KEY`, `HARDWARE_INGEST_SECRET`, `HF_TOKEN`, optional `CALMER_CHAT_MODEL`.
`.env.local` was not carried over — recreate it. Never commit the service-role key.
