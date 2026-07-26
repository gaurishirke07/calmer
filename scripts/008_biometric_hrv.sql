-- CALMER migration 008 — capture HRV on biometric_reading.
--
-- The pulse sensor produces IBI (inter-beat interval, ms) per beat. Storing the
-- IBI and the rolling RMSSD (root mean square of successive IBI differences)
-- makes the report's SWELL-KW / HRV grounding legitimate — SWELL classifies
-- stress from HRV features, not raw BPM. Additive and idempotent.

alter table public.biometric_reading
  add column if not exists ibi integer,      -- inter-beat interval, milliseconds
  add column if not exists rmssd numeric;    -- rolling RMSSD over recent IBIs, ms
