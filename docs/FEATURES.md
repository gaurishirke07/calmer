# CALMER — features, ranked for presentations and demos

What CALMER does, in the order to pitch it. Each feature has a one-line
**pitch**, **how it works** (for questions), **demo** steps, **evidence**, and
**don't overclaim** (what a sharp reviewer will catch). Numbers are from the
code and analysis scripts as of 2026-10-06.

> **30-second pitch.** Venting helps only if it ends at the right moment, and
> reflection helps only if someone is ready for it. CALMER is a two-stage
> system, a symbolic rage room and an AI companion, joined by a *readiness
> score* that fuses venting behaviour, physiology, language and time to decide
> **when** to move someone from venting to reflection. The decision rule is
> explainable on screen, every decision is logged, and a micro-randomised
> trial to test it is already built into the app.

Audience key: **R** = research panel (contribution, rigour) · **P** = project /
demo panel (working system, wow) · **E** = ethics / supervisor.

---

## Tier 1 — the contribution (lead with these)

### 1. The readiness score: a continuous, multi-signal "when" decision · R P
- **Pitch:** One number, updated every 3 seconds, that says how settled the
  user is, and therefore *when* to offer reflection.
- **How it works:** a weighted fusion of signals: venting trend 0.35,
  biometric trend 0.30, text sentiment 0.20, time in session 0.15 (opt-in face
  and voice 0.175 each). Weights **renormalise over whatever is present**, so
  the score still works with the sensor unplugged or no text yet. Trends are
  measured as a decline from the session's own peak, so it reads *calming
  down*, not a fixed level. It is framed as a JITAI decision rule (Nahum-Shani
  et al., 2018).
- **Demo:** `/game` → smash for 20 s, then stop. The Calm Meter climbs and the
  per-signal panel shows each signal's value and weight; `/readiness` explains it.
- **Evidence:** 127 unit tests; the score is recomputed from stored data by
  `scripts/weight-sensitivity.mjs` to within 0.002. Moving any one weight by
  ±0.10 keeps the calm/not-calm call on 92–100% of decision points.
- **Don't overclaim:** the weights are literature-grounded *priors*, not
  learned. The score is a proxy for readiness, not a validated measure of
  emotion. The game's decision uses venting + time (the sensor is fused in
  chat and the biometric route, not in-game: see MRT-PROTOCOL §3.2).

### 2. The vent → reflect handoff, with one continuous session · R P
- **Pitch:** The offer to talk appears when the score has *held* above the
  threshold, and the companion already knows you just vented.
- **How it works:** the offer needs readiness ≥ 0.66 for 3 consecutive readings
  (~9 s) and is withdrawn if venting resumes. Venting is capped at 120 s. Game
  and chat share one `session`, so the chat's readiness keeps fusing the venting
  history, and the companion's prompt says the user came from the rage room
  (never mentioning scores).
- **Demo:** let the offer appear → "Talk it through" → the first reply
  acknowledges the venting.
- **Evidence:** every offer shown / withdrawn / taken is logged (`handoff_event`).
- **Don't overclaim:** one hit followed by ~12 s of quiet can trigger the offer
  today; a minimum-venting rule is a pending decision.

### 3. An evaluation built into the product: a micro-randomised trial · R E
- **Pitch:** CALMER can test its own core idea, the readiness rule against a
  fixed 60-second timer, with every participant as their own control.
- **How it works:** the *database* draws each session's arm (p = 0.5), so
  nobody can choose or alter it; offers are logged; trial mode makes the two arms
  identical except for the offer timing; analysis uses weighted-and-centred
  least squares (Boruvka et al., 2018) with participant-clustered errors
  (`scripts/mrt-analysis.mjs --trial`).
- **Evidence:** power simulation: ~35 people × 10 sessions detect a small
  effect (d = 0.3) with 80% power; ~13 people for a medium one (d = 0.5).
  The protocol (`paper/MRT-PROTOCOL.md`) covers outcomes, ethics and a freeze
  checklist.
- **Don't overclaim:** the trial has **not been run**. Current data is from the
  developers and is a pipeline test only. Ethics approval comes first.

## Tier 2 — safety and trust (the questions every reviewer asks)

### 4. A layered, fail-safe crisis pathway · R E P
- **Pitch:** Every message is risk-checked twice, and if anything fails, the
  user sees a crisis line rather than silence.
- **How it works:** a fast keyword filter and an LLM risk classifier
  (warning-signs prompt); the higher verdict wins. HIGH risk switches the reply
  to safety mode, logs a flag recording which layer fired, and **always shows
  the Tele-MANAS 14416 line under the reply**. If the check can't run, the
  reply carries the crisis line. If the reply itself fails, a fixed fallback
  message with the line appears. The server rebuilds the chat history itself,
  so a crafted request can't slip past the check.
- **Demo:** (rehearse first) a clearly risky test phrase → safety reply + red
  crisis box. Show `scripts/safety-eval.mjs` output on a slide.
- **Evidence:** labelled set of 102 messages (30 crisis, 24 distress, 40 safe,
  8 ambiguous), each classified 3×. Combined recall **100%** (30/30), precision
  73.2%; the LLM alone 93.8% precision; keywords alone catch only 30%, which is
  why they're a backstop, not the detector.
- **Don't overclaim:** in-sample (the prompt was tuned on this set), single-turn
  only, not clinically validated. CALMER is not a crisis service.

### 5. Privacy and data rights by design · E R
- **Pitch:** Your data is yours: row-level security on every table, full
  export, password-confirmed deletion, and nothing shared without consent.
- **How it works:** Supabase Postgres with row-level security everywhere;
  trial randomisation and sensor writes run on the server only. Export covers
  every table (paged). Account deletion re-checks the password on the server and
  cascades. Security headers are set and dependencies audited.
- **Evidence:** four audit rounds (seven independent reviews), every finding logged with its
  status (`paper/ISSUE-REGISTER.md`); live probes confirm anonymous visitors read
  nothing.
- **Don't overclaim:** chat text is processed by Groq and Hugging Face, and the
  research team can access study data. The consent form must say both.

### 6. Trusted supporter (supervisor's suggestion) · E P
- **Pitch:** Let someone you trust see how you're doing, never what you said,
  and tell them when you're struggling with one tap.
- **How it works:** up to 3 people per user, by single-use invite (7 days,
  email-locked). The supporter's page shows 14-day aggregates only: sessions per
  day, how calm sessions ended, high-stress days, and the *date* of any safety
  concern. "Let them know I'm struggling" opens a WhatsApp/email message the
  user sends themselves, plus the crisis line. Either side can end it instantly.
- **Demo:** two browsers: owner's Settings → invite → supporter accepts →
  `/support` dashboard; owner presses "Let them know".
- **Don't overclaim:** no automatic alerts (deliberately). It's off in trial
  mode, since a second person isn't covered by the ethics scope.

## Tier 3 — demo "wow" (lead with these for a project panel)

### 7. The rage room · P
- **Pitch:** A physics-style room you can wreck: 6 weapons, 4 rooms and a
  ragdoll "buddy" you name yourself.
- **How it works:** canvas game (bat, pistol, shotgun, grenade, molotov,
  chainsaw; classroom, office, living room, kitchen). There's deliberately **no
  score**, since rewarding destruction would reinforce anger (catharsis
  research). Every action is telemetry for the readiness score. It works with
  mouse, touch and pen.
- **Demo:** grenade a room → DESTROYED! → reset.

### 8. Play with your bare hand (computer vision) · P
- **Pitch:** Make a fist at your webcam to smash; open your hand to stop.
- **How it works:** MediaPipe hand landmarks run in the browser; a fist/open
  state machine drives the same input path as the mouse, so the telemetry is
  identical. Nothing is uploaded.
- **Demo:** "Smash with your hand" in real Chrome (camera permission first).

### 9. Opt-in face and voice signals, on-device · P R
- **Pitch:** With permission, the score can also read your expression and how
  loudly you're shouting, without anything leaving your laptop.
- **How it works:** face-api expression valence and Web Audio loudness above
  the room's noise floor (no speech recognition, nothing recorded), each
  measured as a decline from its own peak. They slot into the same renormalising
  fusion, off by default and hidden in trial mode.
- **Demo:** turn on the camera/mic toggles → shout, then calm down → watch those
  panel rows move.
- **Don't overclaim:** expressions and loudness are noisy correlates of
  emotion (Barrett et al., 2019), so they're never used as ground truth.

### 10. A stress ball that reads your body · P R
- **Pitch:** Squeeze a stress ball with a pulse sensor on your finger; the
  system reads grip and heart rate.
- **How it works:** Arduino Uno + force-sensitive resistor + optical pulse
  sensor → serial bridge → `/api/biometric` (secret-gated). Implausible heart
  rates (outside 40–180 bpm) are rejected, channels renormalise if one drops, and
  every reading is tagged with its source (board vs simulator).
- **Evidence:** bench-tested: ~1,530 real sensor readings.
- **Don't overclaim:** the stress score uses heart-rate bands; RMSSD is now
  computed on successive beats (firmware fix 2026-10-06) but isn't used by the
  score and still needs a bench test. The sensor isn't part of the in-game
  decision.

## Tier 4 — the companion experience · P

### 11. AI companion chat with safe, persistent memory
- Open-weight `gpt-oss-120b` via Groq; positioned as first-level support, never
  as therapy. It remembers preferences (calming strategies, triggers, goals)
  through narrow rules, but **never stores crisis language**, and memories are
  capped in the prompt. It's rate-limited per user to protect the shared quota.

### 12. Honest mood dashboard
- Stress at the **end** of each session (not inflated by the game's opening
  readings), negative mood from chat sentiment, an emotion mix from a RoBERTa
  classifier (j-hartmann), and change versus the previous fortnight, which can
  show getting worse too. Days are counted in IST, and gaps mean "no data".

### 13. Session summaries
- One click summarises the conversation so far, grounded only in what was said.
  The summary feeds back into the chat as context.

## Tier 5 — engineering and research quality (for technical questions) · R

### 14. Research tooling
- Weight-sensitivity study with figure, safety-evaluation harness (cached, prompt-hashed),
  biometric data-quality and provenance analysis, MRT analysis with power
  simulation, and a pre-registered `--trial` mode.

### 15. Engineering
- Next.js 16 / React 19 / TypeScript strict / Supabase. 127 unit tests and CI on
  every push. All migrations apply cleanly in sequence on a fresh Postgres, and
  each new one is behaviour-tested as owner, supporter and stranger first. It's deployed on Vercel with a database keep-alive, and documented
  (README, DEPLOYMENT, TEST-PLAN, TRUSTED-SUPPORTER).

---

## 5-minute demo script

1. **(0:00) Problem, 20 s:** venting vs reflection, and why timing matters.
2. **(0:20) Rage room, 60 s:** pick a room, smash (show the hand gesture if
   Chrome + camera are ready). Point at the Calm Meter rising when you stop.
3. **(1:20) The decision, 40 s:** open the per-signal panel: weights,
   renormalisation, "3 calm readings". The offer appears → take it.
4. **(2:00) Companion, 60 s:** the first reply knows you vented. Show memory and
   the summary.
5. **(3:00) Safety, 40 s:** the eval slide (100% recall, keywords 30%), then the
   crisis-line box on a test phrase.
6. **(3:40) Trust, 40 s:** the supporter view (aggregates only), privacy, and
   export/delete.
7. **(4:20) Evidence, 40 s:** the MRT is built in; power for 35 people; the
   honest limits.

## Questions to expect (and the short answer)

- **"Why these weights?"** They're literature-grounded priors ordered by how
  direct the evidence is. The sensitivity study shows the calm/not-calm call
  barely moves under ±0.10. The trial's self-reports will let us fit them
  (`MRT-PROTOCOL` §9).
- **"How do you know it works?"** We don't yet. That's what the built-in
  micro-randomised trial is for, and it's powered and pre-registerable.
- **"Isn't venting harmful?"** Catharsis that rewards aggression can be. That's
  why there's no score, a 120 s cap, and a handoff to reflection.
- **"What if someone is in crisis?"** Two-layer detection, a guaranteed crisis
  line, fail-safes on every failure path. And it isn't a crisis service, which
  the app says.
- **"Is the data safe?"** Row-level security on every table, server-side trial
  randomisation, export, password-confirmed deletion, four audit rounds. Third-party
  processing is disclosed.

## Never claim

It's therapy · it measures emotion · the trial has shown an effect · the
sensor drives the in-game decision · HRV drives the stress score · the safety
numbers are out-of-sample.
