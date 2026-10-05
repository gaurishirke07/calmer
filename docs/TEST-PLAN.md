# CALMER — what to test, and how

Everything that has to be checked before a demo and before the study, in one
list. Each item says who can run it and its status as of **2026-10-06**.

**Who:** 🤖 automatic (CI on every push) · 🧑‍💻 can be run without signing in
(locally or on the live site) · 👤 needs a signed-in person · 👥 needs two
accounts · 📱 needs a real phone · 🎥 needs camera/mic in real Chrome (the
in-app browser blocks them) · 🔌 needs the Arduino board · 🧪 needs volunteers

**Status:** ✅ verified (how is noted) · ⬜ not yet · ⚠️ partly

Use a **test account**, not your own, for anything that deletes or floods data.
Live site: https://calmer-phi.vercel.app

---

## 0. Automatic checks (every push) 🤖

| check | covers | status |
|---|---|---|
| `npx tsc --noEmit` | types across the whole app | ✅ |
| `npx vitest run` — 127 tests, 11 files | readiness fusion + guards, handoff rule, NaN inputs, safety keywords + verdict parsing, chat-history sanitising, memory rules, supporter digest + links, dashboard maths (IST days, end-of-session stress), voice/face/gesture helpers, HRV maths, MRT statistics, safe redirects | ✅ |
| `npx eslint .` | lint (0 errors; 6 known warnings) | ✅ |
| `npx next build` | production build | ✅ |
| GitHub Actions CI | all of the above on GitHub | ✅ (green on every push so far) |

## 1. Database and security

| # | test | how | who | status |
|---|---|---|---|---|
| 1.1 | All migrations apply in order | fresh Postgres 18 + Supabase auth shim, 001 → 015 | 🧑‍💻 | ✅ 2026-10-06 |
| 1.2 | Anonymous visitors read nothing | anon key GET on every table → 0 rows / 401; every function → refused | 🧑‍💻 | ✅ live 2026-10-05 |
| 1.3 | Trial integrity (013) | arm can't be set or edited; fake sensor / biometric rows refused; 400 draws ≈ 50/50 | 🧑‍💻 | ✅ local Postgres (208/192); live: functions present ✅ |
| 1.4 | Run **015** on the live project | Supabase SQL editor, then anon call to `leave_support` → refused (exists) | 👤 | ⬜ |
| 1.5 | User A can't see user B's data | sign in as A, open `/chat?session=<B's id>` → treated as not found; dashboards show only own data | 👥 | ⬜ |
| 1.6 | Supporter sees aggregates only | supporter's `/support` shows trends + dates, never text; supporter can't open the owner's sessions | 👥 | ✅ local Postgres · ⬜ live |
| 1.7 | Security headers on the live site | `curl -I https://calmer-phi.vercel.app` shows X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | 🧑‍💻 | ✅ local · ⬜ live after next deploy |
| 1.8 | Signed-out users are sent to login | `/dashboard`, `/settings`, `/chat`, `/support` → 307 to `/auth/login`; `/support/accept` stays public | 🧑‍💻 | ✅ local |
| 1.9 | Dependency audit | `npm audit --omit=dev` → no high/critical | 🧑‍💻 | ✅ (4 low in the AI SDK) |

## 2. Sign-up, sign-in and email links

| # | test | expected | who | status |
|---|---|---|---|---|
| 2.1 | Sign up with a new email | confirmation email arrives; link (same browser) signs you in and opens the dashboard | 👤 | ⬜ |
| 2.2 | Forgot password | email arrives; link opens "Choose a password" **showing your email**; save → dashboard | 👤 | ⬜ |
| 2.3 | Invite from the Supabase dashboard (Authentication → Users → Invite) | invite email → link → "Choose a password" → dashboard | 👤 | ⬜ |
| 2.4 | A planted/expired link | `…/#error=…` or a non-invite token in the link → error page, no sign-in | 🧑‍💻 | ✅ expired-link case |
| 2.5 | "Choose a password" with no session | says the link expired; Save disabled | 🧑‍💻 | ✅ |
| 2.6 | `/auth/confirm` refuses link types the app never sends | `type=magiclink` → error page | 🧑‍💻 | ✅ |
| 2.7 | After SMTP + templates (DEPLOYMENT §4) | 2.1–2.3 again, opening the email on a **different device** | 👤 | ⬜ |

## 3. The rage room (Module 1)

| # | test | expected | who | status |
|---|---|---|---|---|
| 3.1 | Play signed out | readiness panel moves; nothing saved | 🧑‍💻 | ✅ |
| 3.2 | Play signed in | in Supabase: a `session` row with `randomised_by = 'db'` and an arm; `venting_interaction` + `emotional_state` rows every ~3 s | 👤 | ⬜ |
| 3.3 | Readiness arm offer | smash, then stop: "ready to reflect?" appears after ~3 calm readings; smash again → it's withdrawn; `handoff_event` has `offer_shown` / `offer_withdrawn` | 👤 | ⬜ |
| 3.4 | Timer arm offer | offer at 60 s regardless of calm; `offer_shown` logged at ~60 s | 👤 | ⬜ |
| 3.5 | Take the offer | "Talk it through" → chat opens on the same session; `offer_accepted` logged | 👤 | ⬜ |
| 3.6 | 120 s cap | session ends at 120 s, including while on the DESTROYED! screen | 👤 | ⬜ (logic ✅) |
| 3.7 | Switch tabs mid-game | readiness and the offer freeze until you come back | 🧑‍💻 | ✅ simulated (62% → hidden → 62% → back → 83%) |
| 3.8 | "Again" / leave the page mid-game | no errors; the last few seconds of hits are still saved | 👤 | ⬜ |
| 3.9 | Trial mode build (`NEXT_PUBLIC_CALMER_TRIAL_MODE=1`) | no Calm Meter, no score-based end message, no opt-in buttons, no supporter UI — in both arms | 🧑‍💻 | ⬜ |
| 3.10 | Phone: tap, drag, hold for chainsaw | hits register; page doesn't scroll; overlays fit | 📱 | ⚠️ simulated touch ✅ · real phone ⬜ |
| 3.11 | Hand-gesture control | fist smashes, open hand stops | 🎥 | ⬜ |
| 3.12 | Face and voice signals | frowning/shouting then calming moves those rows of the panel; nothing is recorded | 🎥 | ⬜ |

## 4. The companion chat (Module 2)

| # | test | expected | who | status |
|---|---|---|---|---|
| 4.1 | First message in a new chat | reply streams; chat appears in the sidebar when the reply finishes | 👤 | ⬜ |
| 4.2 | Arriving from the game | the opening reply acknowledges you just vented (never mentions scores) | 👤 | ⬜ |
| 4.3 | "Continue Last Chat" on the dashboard | full history loads | 👤 | ⬜ |
| 4.4 | Switch chats / delete the open chat **while a reply is streaming** | the reply stops; nothing leaks into the other chat | 👤 | ⬜ |
| 4.5 | A clearly high-risk message (use a phrase from `scripts/safety-eval-set.json`) | safety-mode reply **plus the red crisis-line box**; a `safety_flag` row whose `trigger_type` says which layer fired | 👤 | ⬜ |
| 4.6 | Chat model broken (local `.env.local`: `CALMER_CHAT_MODEL=nonexistent`) | amber "couldn't respond" bubble with the crisis line | 👤 | ⬜ |
| 4.7 | Rate limit | 9 messages inside a minute → the 9th gets the "slow down" bubble (with crisis line) | 👤 | ⬜ |
| 4.8 | Summarise session | "saved" notice; summary used as "this conversation so far" | 👤 | ⬜ |
| 4.9 | Memories | "deep breathing helps me" → appears in Settings; a crisis message never becomes a memory | 👤 | ⬜ |
| 4.10 | Sidebar by keyboard | Tab to a chat, Enter opens it; rename/delete reachable without a mouse | 👤 | ⬜ |

## 5. Dashboard

| # | test | expected | who | status |
|---|---|---|---|---|
| 5.1 | After one game + one chat | "Stress at session end" and "Negative mood in chat" show values; other days are gaps, not zeros | 👤 | ⬜ (maths ✅ unit tests) |
| 5.2 | Late-night session (after 23:00 IST) | counts on today's IST date | 👤 | ⬜ (✅ unit test) |
| 5.3 | Console | no hydration error | 👤 | ⬜ |
| 5.4 | No data yet | dashes and "None yet", nothing broken | 👤 | ⬜ |

## 6. Settings and data rights

| # | test | expected | who | status |
|---|---|---|---|---|
| 6.1 | Add / delete a memory; try adding crisis text | saved / removed / refused with a helpful message | 👤 | ⬜ |
| 6.2 | Export | JSON includes sessions, chats, readiness, venting, biometrics, safety flags, offer events, trusted contacts, memories | 👤 | ⬜ |
| 6.3 | Delete account (**test account only**) | wrong password refused; right password deletes; that login no longer works | 👤 | ⬜ |

## 7. Trusted supporter (two accounts) 👥

| # | test | expected | status |
|---|---|---|---|
| 7.1 | Owner adds a person → copies/sends the invite → supporter accepts with that email | `/support` shows the owner's 14-day summary | ⬜ |
| 7.2 | Accept with a different email / reuse the link / after 7 days | refused | ✅ local Postgres · ⬜ live |
| 7.3 | "Let them know I'm struggling" | WhatsApp/email opens with the message; supporter sees the request on `/support` | ⬜ |
| 7.4 | Owner removes the supporter | supporter loses access immediately | ⬜ |
| 7.5 | Supporter clicks "Stop being their trusted person" (after 015) | gone from both sides | ⬜ |
| 7.6 | A safety-mode chat by the owner | supporter sees "a safety concern came up on <date>", never the text | ⬜ |

## 8. Phones and accessibility

| # | test | expected | who | status |
|---|---|---|---|---|
| 8.1 | 375 px signed out | menu button opens Home / How It Works / Release Anger / Find Peace; no sideways scrolling | 🧑‍💻 | ✅ |
| 8.2 | 375 px signed in | menu also has Dashboard, Settings, Sign Out | 📱 | ⬜ |
| 8.3 | Chat on a phone | sidebar starts closed; toggle works | 📱 | ⬜ |
| 8.4 | Homepage buttons | links, not buttons-in-links (keyboard + screen readers) | 🧑‍💻 | ✅ |

## 9. Sensor hardware 🔌

| # | test | expected | status |
|---|---|---|---|
| 9.1 | Bench test (hardware/TESTING.md) | readings arrive; implausible heart rates rejected; rows tagged with the board's device | ⬜ |
| 9.2 | Simulator run | rows tagged `simulator`; `biometric-quality.mjs` lists them as simulated | ⬜ (🧑‍💻 can run with a session id) |
| 9.3 | After the HRV firmware fix | every beat reaches the server; RMSSD sane at rest | ⬜ (fix not built) |

## 10. Research pipeline

| # | test | expected | who | status |
|---|---|---|---|---|
| 10.1 | Re-run after any rule change: `weight-sensitivity`, `safety-eval` (cached), `biometric-quality`, `mrt-analysis` | replay fidelity ≤ 0.002; eval numbers recorded in PAPER-STATE | 🧑‍💻 | ✅ 2026-10-05 |
| 10.2 | `mrt-analysis.mjs --trial --from <date>` | only DB-randomised sessions in the window; developer accounts excluded | 🧑‍💻 | ✅ (0 sessions so far, as expected) |
| 10.3 | **Dry run**: 2–3 volunteers on a trial-mode deployment, then 10.2 | every session has an arm, offers logged, analysis runs end to end | 🧪 | ⬜ |

## 11. Before every demo (10 minutes)

1. Supabase project awake (open the site; if sign-in fails, resume it in Supabase).
2. Live site: home → game (play 30 s) → chat → dashboard, signed in with a demo account that already has a few sessions.
3. Chat replies (Groq up). If not, the amber fail-safe bubble shows: say so, it's a feature.
4. Camera/mic features only in real Chrome, with permission granted beforehand.
5. Browser zoom 100%, notifications off, a second tab with the explainable `/readiness` page.

## 12. Before the study (gate)

All of 1.4–1.6, 2.1–2.3 (with SMTP), 3.2–3.9, 4.1–4.7, 6.2–6.3, 10.3 ✅ — plus
the decisions in `paper/MRT-PROTOCOL.md` §3 frozen and ethics approval in hand.
