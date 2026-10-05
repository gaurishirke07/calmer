-- 015: trusted-supporter follow-ups (audit 2026-10-05, Q4 + Q7).
-- Functions only — no table changes — so it is safe to run before or after
-- deploying the matching code (the "Stop supporting" button reports
-- "not available yet" until this exists).
--
--   Q4: two invites created at the same instant could both pass the
--       3-person cap (count, then insert, with nothing in between). A
--       per-user transaction lock now serialises them.
--   Q7: a supporter had no way to step back; only the owner could revoke.

-- ── Q4: create_support_invite, serialised per user ──────────────────────────
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
  -- One invite at a time per user, so the cap below can't be raced.
  perform pg_advisory_xact_lock(hashtext('create_support_invite:' || auth.uid()::text));
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

-- ── Q7: the supporter can step back ─────────────────────────────────────────
-- Same effect as the owner removing them: status 'revoked', immediate.
create or replace function public.leave_support(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trusted_contact
  set status = 'revoked', revoked_at = now(), invite_token_hash = null
  where id = p_contact_id and supporter_user_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.leave_support(uuid) from public, anon;
grant execute on function public.leave_support(uuid) to authenticated;
