-- 016: every heartbeat reaches the server (HRV fix, audit A4/R4/P6f).
--
-- The firmware used to print one beat interval per ~1 s loop and the bridge
-- forwarded the latest one every ~2 s, so the "successive" intervals stored
-- were beats 2–3 apart and the rolling RMSSD was not RMSSD. The new firmware
-- reports every beat (BEAT:<ms> lines) and the bridge posts all beats since its
-- last post as `ibis`; /api/biometric joins them across readings into runs of
-- truly successive beats (lib/calmer/hrv-quality.ts contiguousBeats).
--
-- Safe in any order with the code: the route saves readings without the list
-- until this column exists. Only the service role (the ingest route) writes
-- biometric rows (migration 013), so no grants are needed.

alter table public.biometric_reading
  add column if not exists ibis integer[];

alter table public.biometric_reading drop constraint if exists biometric_reading_ibis_check;
alter table public.biometric_reading
  add constraint biometric_reading_ibis_check
  check (ibis is null or cardinality(ibis) <= 30);

comment on column public.biometric_reading.ibis is
  'Every beat interval (ms) the bridge received since its previous post, oldest first. NULL from the old bridge, whose single ibi is the latest beat only.';
