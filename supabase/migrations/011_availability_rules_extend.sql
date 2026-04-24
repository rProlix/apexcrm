-- supabase/migrations/011_availability_rules_extend.sql
-- Extends availability_rules with repeat types, custom day patterns,
-- and slot_interval_minutes. Adds composite index for double-booking prevention.

-- ── 1. availability_rules: add repeat + interval columns ─────────────────────

ALTER TABLE public.availability_rules
  ADD COLUMN IF NOT EXISTS slot_interval_minutes integer,
  ADD COLUMN IF NOT EXISTS repeat_type           text    NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS repeat_days           integer[];           -- e.g. [1,3,5]

-- Check constraint for repeat_type values
ALTER TABLE public.availability_rules
  DROP CONSTRAINT IF EXISTS availability_rules_repeat_type_check;

ALTER TABLE public.availability_rules
  ADD CONSTRAINT availability_rules_repeat_type_check
  CHECK (repeat_type IN ('daily', 'weekly', 'custom'));

-- Backfill slot_interval_minutes from slot_duration_minutes for existing rows
UPDATE public.availability_rules
   SET slot_interval_minutes = slot_duration_minutes
 WHERE slot_interval_minutes IS NULL;

-- Set NOT NULL + default after backfill
ALTER TABLE public.availability_rules
  ALTER COLUMN slot_interval_minutes SET DEFAULT 30;

ALTER TABLE public.availability_rules
  ALTER COLUMN slot_interval_minutes SET NOT NULL;

-- ── 2. Drop the unique constraint on (tenant_id, day_of_week) ─────────────────
-- Multiple rules per day (e.g. morning + afternoon blocks) require non-unique.
-- The per-day uniqueness was only practical for the simple weekly-one-per-day model.

DROP INDEX IF EXISTS availability_rules_tenant_day_uidx;

-- Replace with a non-unique index for query performance
CREATE INDEX IF NOT EXISTS availability_rules_tenant_day_idx
  ON public.availability_rules (tenant_id, day_of_week);

CREATE INDEX IF NOT EXISTS availability_rules_tenant_repeat_idx
  ON public.availability_rules (tenant_id, repeat_type);

-- ── 3. Rename is_available → is_active (more accurate terminology) ────────────
-- Keep both columns for backward compatibility; is_active takes precedence.

ALTER TABLE public.availability_rules
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Sync existing is_available values into is_active
UPDATE public.availability_rules SET is_active = is_available;

-- ── 4. appointments: add composite index for conflict queries ─────────────────
-- Critical for double-booking prevention performance.

CREATE INDEX IF NOT EXISTS appointments_tenant_starts_ends_idx
  ON public.appointments (tenant_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS appointments_tenant_starts_idx
  ON public.appointments (tenant_id, starts_at);

-- ── 5. blocked_times: ensure composite index exists ──────────────────────────

CREATE INDEX IF NOT EXISTS blocked_times_tenant_range_idx
  ON public.blocked_times (tenant_id, start_time, end_time);
