# Trusted supporter — design

*Supervisor's suggestion (2026-10-04): someone the user trusts can see how
they are doing and help. Agreed scope: the supporter sees **trends and whether
a safety concern happened, never chat text**. Alerts start as a button the
**user** presses; automatic alerts come later, only with explicit consent.*

**Status (2026-10-04):** built. Migration `scripts/014_trusted_supporter.sql`
(not yet run on the live project); UI in `components/support/`; pages
`/support` and `/support/accept`; helpers + 9 tests in `lib/calmer/supporter.ts`.
The SQL was run against a local Postgres 18 with a Supabase-style auth shim and
tested as owner, supporter and stranger: strangers see nothing, chat/flag text
never appears in the summary, revoking cuts access immediately, used/expired
invites and wrong-email accepts are refused, at most 3 contacts, one request
per 10 minutes, account deletion cascades.

## 1. Principles

1. **The user is in control.** Only the user can add a supporter, and they can
   revoke access at any time with immediate effect. The supporter can't see
   anything the user hasn't been shown first ("what Priya sees" preview).
2. **Aggregates, not content.** No chat messages, memories, summaries, venting
   detail or sensor readings. A safety concern shows only as "a safety concern
   was flagged on <date>", never the text that triggered it.
3. **Not a crisis service.** Every supporter-facing page carries the crisis line
   (Tele-MANAS 14416) and brief guidance on what to do. CALMER does not page
   anyone automatically in this version.
4. **Off in trial mode.** A supporter would change the intervention and add a
   second data subject the ethics approval doesn't cover. Re-enable only if the
   protocol and consent form include it.

## 2. What the supporter sees (`/support`)

For each person who has added them:

| shown | source | never shown |
|---|---|---|
| sessions per day, last 14 days | `session` count | titles, chat text |
| average end-of-session readiness per day (calm trend) | `emotional_state.readiness_score` | per-signal detail |
| days a session **ended** highly stressed | the session's last `emotional_state` | sensor values; mid-session readings (the game always starts at 'high') |
| "a safety concern came up" + date (last 14 days) | a **high**-severity `safety_flag` (the chat switched to safety mode) | `source_text`, low-severity distress flags |
| "last active" date | latest `session.updated_at` | — |
| requests for support the user sent (§4) | `support_request` | — |

All of this comes from one `security definer` function that returns these
aggregates and nothing else. The supporter has **no** RLS access to the user's
tables.

## 3. Lifecycle

```
user: Settings → "Add a trusted person" (name + email)
  → trusted_contact row, status 'pending', single-use invite token (stored hashed)
  → user copies the invite link and sends it themselves (no email service yet)
supporter: opens /support/accept?token=…  → signs in or signs up
  → accept_support_invite(token): token valid, unused, not expired (7 days),
    email matches the invited address → status 'active', supporter_user_id set
user: Settings → "Remove" → status 'revoked' → the summary function returns
  nothing from that moment on
```

Removing a supporter keeps the row (status 'revoked') so the user can see the
history. Deleting the account deletes everything (cascade from `auth.users`).

## 4. "Let them know I'm struggling"

A button in chat and on the dashboard, shown only when an active supporter
exists:

1. It records a `support_request` (user, contact, time). The supporter sees it
   on `/support` next time they look.
2. It opens a **pre-filled message the user sends themselves**: WhatsApp
   (`wa.me` share link) or email (`mailto:`). No server-side email, so there's
   no email provider, no deliverability or spam problems, and no message
   leaves CALMER without the user sending it.
3. It also shows the crisis line, because someone pressing this button may
   need more than a friend.

## 5. Later: automatic alerts (not built)

Only after the user opts in separately and per supporter, e.g. "email Priya if
a safety concern is flagged". This needs an email provider (Resend/SMTP), rate
limiting, quiet hours, and wording reviewed with the supervisor. It is outside
the current ethics scope; treat it as a separate feature with its own consent.

## 6. Data model (migration 014)

- `trusted_contact`: `id`, `user_id` → auth.users (cascade), `display_name`,
  `supporter_email`, `supporter_user_id` (null until accepted),
  `invite_token_hash`, `invite_expires_at`, `status` ('pending' | 'active' |
  'revoked'), `created_at`, `accepted_at`, `revoked_at`.
  Clients can only SELECT (and not the token hash): the owner their own rows,
  a supporter the rows where `supporter_user_id = auth.uid()` and status is
  'active' (names only; the data comes via the function). Every write goes
  through the functions below. A supporter deleting their account leaves the
  row 'active' with no supporter; it no longer counts toward the 3 and the
  owner sees "deleted their account". Expired invites don't count either.
- `support_request`: `id`, `contact_id` → trusted_contact (cascade),
  `created_at`. Written only by `request_support()`; readable by the owner and
  the active supporter.
- `accept_support_invite(token text)` and `supporter_summary(contact_id uuid)`:
  `security definer`, `search_path = ''`, each checks `auth.uid()` against
  the row before returning anything.
- Export includes `trustedContacts` and `supportRequests`.

## 7. Open questions for the supervisor

- Should a supporter see the safety flag at all, or only the requests the user
  sends? (Current design: yes, date only. It is the main reason a supporter
  exists, and the user is told on the add screen.)
- How many supporters per user? (Proposed: up to 3.)
- Wording of the supporter guidance text. Needs someone with counselling
  background to review it.
