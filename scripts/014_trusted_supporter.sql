-- 014: trusted supporter (design: docs/TRUSTED-SUPPORTER.md).
--
-- A user can let up to 3 people they trust see how they are doing: sessions
-- per day, a calm trend, high-stress days, the DATE of any safety-mode
-- escalation, and support requests the user sends. Never chat text, memories,
-- summaries, venting detail or sensor values.
--
-- All writes go through the functions below (security definer, each checks
-- auth.uid() against the row); the tables grant clients SELECT only. The
-- supporter has no RLS access to the user's own tables at all; their view is
-- supporter_summary(), which returns aggregates and nothing else.
--
-- Day buckets use Asia/Kolkata (the study population); change TZ below if not.

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.trusted_contact (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  supporter_email text not null check (char_length(supporter_email) between 3 and 254),
  supporter_user_id uuid references auth.users(id) on delete set null,
  invite_token_hash text unique,
  invite_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.support_request (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.trusted_contact(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_trusted_contact_user on public.trusted_contact(user_id);
create index if not exists idx_trusted_contact_supporter on public.trusted_contact(supporter_user_id);
create index if not exists idx_support_request_contact on public.support_request(contact_id, created_at);

alter table public.trusted_contact enable row level security;
alter table public.support_request enable row level security;

revoke insert, update, delete on public.trusted_contact from anon, authenticated;
revoke insert, update, delete on public.support_request from anon, authenticated;
-- The token hash is never readable by clients (only the functions compare it).
revoke select on public.trusted_contact from anon, authenticated;
grant select (id, user_id, display_name, supporter_email, supporter_user_id, invite_expires_at,
              status, created_at, accepted_at, revoked_at)
  on public.trusted_contact to authenticated;

drop policy if exists "trusted_contact_select_owner" on public.trusted_contact;
create policy "trusted_contact_select_owner" on public.trusted_contact
  for select using (auth.uid() = user_id);
drop policy if exists "trusted_contact_select_supporter" on public.trusted_contact;
create policy "trusted_contact_select_supporter" on public.trusted_contact
  for select using (auth.uid() = supporter_user_id and status = 'active');

drop policy if exists "support_request_select" on public.support_request;
create policy "support_request_select" on public.support_request for select using (
  exists (
    select 1 from public.trusted_contact c
    where c.id = contact_id
      and (c.user_id = auth.uid() or (c.supporter_user_id = auth.uid() and c.status = 'active'))
  )
);

-- ── Invite (owner) ──────────────────────────────────────────────────────────
-- Returns the plain token ONCE; only its SHA-256 is stored.
create or replace function public.create_support_invite(p_display_name text, p_supporter_email text)
returns table (contact_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_email text := lower(trim(p_supporter_email));
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if v_email = (select lower(u.email) from auth.users u where u.id = auth.uid()) then
    raise exception 'you cannot add yourself' using errcode = '22023';
  end if;
  -- Count people who can see the summary now or still could: active with an
  -- account, or a pending invite that hasn't expired.
  if (select count(*) from public.trusted_contact c
      where c.user_id = auth.uid()
        and ((c.status = 'active' and c.supporter_user_id is not null)
             or (c.status = 'pending' and c.invite_expires_at > now()))) >= 3 then
    raise exception 'at most 3 trusted people' using errcode = '22023';
  end if;

  insert into public.trusted_contact (user_id, display_name, supporter_email, invite_token_hash, invite_expires_at)
  values (auth.uid(), trim(p_display_name), v_email,
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '7 days')
  returning id into v_id;

  return query select v_id, v_token;
end;
$$;

-- ── Accept (supporter) ──────────────────────────────────────────────────────
create or replace function public.accept_support_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.trusted_contact;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_contact from public.trusted_contact c
  where c.invite_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and c.status = 'pending'
  for update;
  if not found then
    raise exception 'invite not found or already used' using errcode = 'P0002';
  end if;
  if v_contact.invite_expires_at < now() then
    raise exception 'invite expired' using errcode = '22023';
  end if;
  if v_contact.user_id = auth.uid() then
    raise exception 'you cannot support yourself' using errcode = '22023';
  end if;
  -- "is distinct from": an account without an email (phone/anonymous sign-in)
  -- gives NULL, and NULL <> x is NULL, which would skip this check.
  if (select lower(u.email) from auth.users u where u.id = auth.uid()) is distinct from v_contact.supporter_email then
    raise exception 'sign in with the email address the invite was sent to' using errcode = '42501';
  end if;

  update public.trusted_contact
  set status = 'active', supporter_user_id = auth.uid(), accepted_at = now(),
      invite_token_hash = null, invite_expires_at = null
  where id = v_contact.id;
  return v_contact.id;
end;
$$;

-- ── Revoke (owner) — immediate ──────────────────────────────────────────────
create or replace function public.revoke_supporter(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trusted_contact
  set status = 'revoked', revoked_at = now(), invite_token_hash = null
  where id = p_contact_id and user_id = auth.uid() and status <> 'revoked';
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ── "Let them know I'm struggling" (owner) ──────────────────────────────────
create or replace function public.request_support(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.trusted_contact c
                 where c.id = p_contact_id and c.user_id = auth.uid() and c.status = 'active') then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  -- one request per contact per 10 minutes is plenty; repeats are not new news
  if exists (select 1 from public.support_request r
             where r.contact_id = p_contact_id and r.created_at > now() - interval '10 minutes') then
    return;
  end if;
  insert into public.support_request (contact_id) values (p_contact_id);
end;
$$;

-- ── People I support (supporter) ────────────────────────────────────────────
create or replace function public.my_supported_people()
returns table (contact_id uuid, person_name text, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         coalesce(nullif(trim(p.display_name), ''), split_part(u.email, '@', 1)),
         c.accepted_at
  from public.trusted_contact c
  join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id
  where c.supporter_user_id = auth.uid() and c.status = 'active'
  order by c.accepted_at;
$$;

-- ── The supporter's view: aggregates only ───────────────────────────────────
-- Callable by the active supporter, or by the owner (to preview exactly what
-- the supporter sees). Last 14 days, Asia/Kolkata day buckets.
create or replace function public.supporter_summary(p_contact_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_tz constant text := 'Asia/Kolkata';
  v_from date := (now() at time zone 'Asia/Kolkata')::date - 13;
begin
  select c.user_id into v_owner from public.trusted_contact c
  where c.id = p_contact_id
    and ((c.supporter_user_id = auth.uid() and c.status = 'active') or c.user_id = auth.uid());
  if v_owner is null then
    return null;
  end if;

  return jsonb_build_object(
    'days', (
      with days as (
        select generate_series(v_from, v_from + 13, interval '1 day')::date as day
      ),
      sess as (
        select (s.start_time at time zone v_tz)::date as day, count(*) as n
        from public.session s
        where s.user_id = v_owner and (s.start_time at time zone v_tz)::date >= v_from
        group by 1
      ),
      -- each session's LAST snapshot = where the session ended up. Stress is
      -- judged here too: the game's first snapshots always read 'high' (the
      -- user is at their venting peak), so "any high reading" would just mean
      -- "used the rage room that day".
      last_state as (
        select distinct on (e.session_id)
               (e.recorded_at at time zone v_tz)::date as day, e.readiness_score, e.stress_level
        from public.emotional_state e
        join public.session s on s.id = e.session_id
        where s.user_id = v_owner and e.readiness_score is not null
          and (e.recorded_at at time zone v_tz)::date >= v_from
        order by e.session_id, e.recorded_at desc
      ),
      calm as (
        select day, round(avg(readiness_score)::numeric, 2) as calm from last_state group by day
      ),
      stress as (
        select distinct day from last_state where stress_level = 'high'
      ),
      safety as (
        select distinct (f.created_at at time zone v_tz)::date as day
        from public.safety_flag f
        join public.session s on s.id = f.session_id
        where s.user_id = v_owner and f.severity = 'high'
          and (f.created_at at time zone v_tz)::date >= v_from
      ),
      requests as (
        select (r.created_at at time zone v_tz)::date as day, count(*) as n
        from public.support_request r
        where r.contact_id = p_contact_id
          and (r.created_at at time zone v_tz)::date >= v_from
        group by 1
      )
      select jsonb_agg(jsonb_build_object(
               'day', d.day,
               'sessions', coalesce(sess.n, 0),
               'calm', calm.calm,
               'highStress', stress.day is not null,
               'safetyConcern', safety.day is not null,
               'supportRequests', coalesce(requests.n, 0)
             ) order by d.day)
      from days d
      left join sess on sess.day = d.day
      left join calm on calm.day = d.day
      left join stress on stress.day = d.day
      left join safety on safety.day = d.day
      left join requests on requests.day = d.day
    ),
    'lastActive', (select max(s.updated_at) from public.session s where s.user_id = v_owner),
    'lastSupportRequest', (select max(r.created_at) from public.support_request r where r.contact_id = p_contact_id)
  );
end;
$$;

revoke execute on function public.create_support_invite(text, text) from public, anon;
revoke execute on function public.accept_support_invite(text) from public, anon;
revoke execute on function public.revoke_supporter(uuid) from public, anon;
revoke execute on function public.request_support(uuid) from public, anon;
revoke execute on function public.my_supported_people() from public, anon;
revoke execute on function public.supporter_summary(uuid) from public, anon;
grant execute on function public.create_support_invite(text, text) to authenticated;
grant execute on function public.accept_support_invite(text) to authenticated;
grant execute on function public.revoke_supporter(uuid) to authenticated;
grant execute on function public.request_support(uuid) to authenticated;
grant execute on function public.my_supported_people() to authenticated;
grant execute on function public.supporter_summary(uuid) to authenticated;
