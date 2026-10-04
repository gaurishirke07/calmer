# Deploying CALMER

How the live site is built and run, what a `git push` changes and what it
doesn't, and the settings that live outside the repo. Checked against Vercel's
docs on 2026-10-04.

## 1. Who controls what

| piece | where it lives | who can change it |
|---|---|---|
| code | GitHub `gaurishirke07/calmer` (public, personal account) | anyone with push access |
| build + hosting | the Vercel project | the Vercel account that owns it |
| environment variables, domains, logs | the Vercel project settings | the Vercel account that owns it |
| database, auth, email settings | the Supabase project | Supabase project members |
| keep-alive job | GitHub Actions (`.github/workflows/keep-alive.yml`) | repo admins (secrets) |

### Will every push update the live site?

Yes, **if the Vercel project is connected to the GitHub repo** (Project →
Settings → Git shows `gaurishirke07/calmer`). Every push to `main` then builds a
production deployment, and other branches get preview URLs.

Vercel's Hobby-plan rule that blocks commits from people other than the
account owner applies only to **private** repos in GitHub **organisations**.
This repo is public and on a personal account, so pushes from any
collaborator deploy.

If the project was created with `vercel --prod` (the `deploy` script in
`package.json`) and never connected to Git, pushes do nothing; the owner
connects it under Project → Settings → Git.

### Can more than one person manage the deployment?

Not on Hobby: a Hobby account has a single member, and a project can't be
transferred between two Hobby accounts. The options are:

1. **The lead owns it (recommended for the study).** The person responsible
   for the trial imports the repo into their own Vercel account (New Project →
   import `gaurishirke07/calmer`) and sets the environment variables. The old
   project is disconnected or deleted so there is one canonical URL. The
   researcher who reviews safety logs needs this access.
2. **Pro team.** $20/month includes one deploying seat. Extra deploying seats
   are $20/month each, and read-only **Viewer** seats (deployments, logs,
   analytics) are free.
3. **Keep it where it is.** The owner shares the URL and forwards logs on
   request. This is fine for demos but awkward for daily safety monitoring.

## 2. What a push does NOT do

- **Database migrations.** SQL in `scripts/0NN_*.sql` is run by hand in the
  Supabase SQL editor, in numeric order. Run a migration **before** pushing
  code that depends on it.
- **Environment variable changes.** Edit them in Vercel, then redeploy
  (Deployments → ⋯ → Redeploy). `NEXT_PUBLIC_*` values are baked in at build
  time, so a redeploy is required.
- **Supabase auth and email settings** (§4).

## 3. Environment variables (Vercel → Project → Settings)

Copy the values from `.env.local`. **Never** put the service-role key in a
`NEXT_PUBLIC_` variable.

| variable | needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything |
| `SUPABASE_SERVICE_ROLE_KEY` | biometric ingest, account deletion (server-only) |
| `GROQ_API_KEY` | chat + safety check |
| `HF_TOKEN` | sentiment classifier (falls back to a lexicon without it) |
| `HARDWARE_INGEST_SECRET` | only if a board posts to the deployed site |
| `NEXT_PUBLIC_CALMER_TRIAL_MODE=1` | **only while the trial runs**. It hides the opt-in sensors and the readiness cues, so the arms differ only in offer timing |
| `CALMER_CHAT_MODEL` | optional model override |

Do **not** set `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` on Vercel: sign-up
confirmation links would point at localhost.

## 4. Supabase settings (dashboard)

- **Authentication → URL Configuration:** Site URL = the Vercel URL. Add
  `https://<vercel-url>/**` to Redirect URLs and keep `http://localhost:3000/**`
  for development.
- **Email links work with the default templates.** Supabase lets you edit
  templates only after custom SMTP is set up, so the app handles the defaults:
  - sign-up confirmation and password reset return to `/auth/confirm` with a
    `?code=`, which works **in the browser that asked for the email**;
  - dashboard invites (and expired links) return to the Site URL with the result
    in the URL fragment, which `components/auth/auth-hash-handler.tsx` picks up:
    invited people land on "Choose a password".
- **Once custom SMTP is set up**, edit the templates (Authentication → Emails →
  Templates) so links also work on a different device. In each, replace
  `{{ .ConfirmationURL }}` in the link with:
  - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`
  - Invite user: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
  - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
- **Site URL must be the Vercel URL** (Authentication → URL Configuration), or
  every emailed link points at localhost.
- **Sign-ups (audit S5).** Sign-up is currently open to anyone who finds the
  URL. For the study, switch off "Allow new users to sign up" and invite
  participants from Authentication → Users → Invite. That way only enrolled people enter the dataset and use the shared
  Groq/HF quota. The trusted-supporter feature is hidden in trial mode, so
  supporters don't need accounts during the study. Outside the study (demos),
  leave sign-ups on so a supporter can create an account from their invite.
- **Email sending.** The built-in sender manages only a few emails an hour.
  Before inviting a cohort, add an SMTP provider (Authentication → Emails) or
  invite people in small batches.
- **Free tier pauses after ~1 week idle.** The keep-alive workflow prevents
  this once its two repo secrets are set (GitHub → Settings → Secrets → Actions:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). If the project
  pauses anyway, the job fails and GitHub emails the repo owner.

## 5. Migrations

Run in order in the SQL editor: `001` → `014`. Already run on the current
project: up to `012`. **Pending:**

- `013_study_integrity.sql` moves trial randomisation into the database, adds
  the `handoff_event` log, and closes the paths that let a participant forge
  study data. The game falls back to the old behaviour until 013 exists, so it
  is safe either way, but the trial must not start without it.
- `014_trusted_supporter.sql` adds the trusted-person feature
  (`docs/TRUSTED-SUPPORTER.md`). Until it exists, the Settings card and the
  "let them know" button simply don't appear.

Both were tested on a local Postgres 18 (all 14 migrations in order, then
behaviour as different users) before being handed over.

## 6. Free-tier limits that matter for a study

- **Groq:** two model calls per chat message (safety check + reply). Bursts
  from several participants at once can hit rate limits. The app then shows
  the fail-safe reply with the crisis line rather than failing silently.
- **Hugging Face:** sentiment falls back to the lexicon stub if throttled
  (recorded per row as `using_stub_signals`).
- **Supabase email:** see §4.

## 7. Smoke test after every deploy

1. Open the URL logged out, then go to `/game`. Play for about 20 s; the
   readiness panel should move (logged-out play is not saved).
2. Sign in, play a game, and open the chat from the offer or "Find Peace".
   The reply should stream and the session should appear in the sidebar.
3. Send a message, reload `/chat?session=<id>`, and check that the history loads.
   Sign out, use "Forgot password?" and check the emailed link lands on
   "Choose a password" (same browser; other devices need the §4 templates).
4. Check the dashboard numbers, then Settings → Export (the JSON should
   include `handoffEvents` after 013) → do not delete your real account.
5. In Vercel → Logs, look for `[chat] SAFETY CHECK FAILED`, `REPLY FAILED` or
   `run migration 013?`.
