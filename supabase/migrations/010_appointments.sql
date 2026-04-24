-- supabase/migrations/010_appointments.sql
-- ApexCRM — Appointments module: extends base schema with full scheduling system

-- ── 1. Extend existing appointments table ────────────────────────────────────

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS title       text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS location    text,
  ADD COLUMN IF NOT EXISTS timezone    text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS created_by  uuid;

-- Backfill title from service_name for existing rows
UPDATE public.appointments SET title = service_name WHERE title IS NULL;

-- Make title NOT NULL once backfilled
ALTER TABLE public.appointments ALTER COLUMN title SET NOT NULL;

-- Make service_name optional (superseded by title)
ALTER TABLE public.appointments ALTER COLUMN service_name DROP NOT NULL;

-- Normalise existing status values to new canonical set
UPDATE public.appointments SET status = 'pending'   WHERE status IN ('scheduled', 'new');
UPDATE public.appointments SET status = 'canceled'  WHERE status = 'cancelled';

-- Update default status
ALTER TABLE public.appointments ALTER COLUMN status SET DEFAULT 'pending';

-- Add check constraint for status values (drop if exists first)
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'canceled'));

-- Add customer_id index if not already present
CREATE INDEX IF NOT EXISTS appointments_customer_id_idx ON public.appointments (customer_id);

-- ── 2. appointment_services ───────────────────────────────────────────────────
-- Optional services attached to an appointment (for extensibility)

CREATE TABLE IF NOT EXISTS public.appointment_services (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id)       ON DELETE CASCADE,
  appointment_id   uuid        NOT NULL REFERENCES public.appointments(id)  ON DELETE CASCADE,
  name             text        NOT NULL,
  duration_minutes integer     NOT NULL DEFAULT 60,
  price            numeric,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appt_services_tenant_idx ON public.appointment_services (tenant_id);
CREATE INDEX IF NOT EXISTS appt_services_appt_idx   ON public.appointment_services (appointment_id);

ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.appointment_services
  FOR ALL USING (true) WITH CHECK (true);

-- ── 3. availability_rules ─────────────────────────────────────────────────────
-- Defines per-tenant operating hours for each day of the week

CREATE TABLE IF NOT EXISTS public.availability_rules (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day_of_week           integer     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time            time        NOT NULL DEFAULT '09:00',
  end_time              time        NOT NULL DEFAULT '17:00',
  slot_duration_minutes integer     NOT NULL DEFAULT 60,
  is_available          boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS availability_rules_tenant_idx ON public.availability_rules (tenant_id);

-- One rule per day per tenant
CREATE UNIQUE INDEX IF NOT EXISTS availability_rules_tenant_day_uidx
  ON public.availability_rules (tenant_id, day_of_week);

ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.availability_rules
  FOR ALL USING (true) WITH CHECK (true);

-- Seed default availability (Mon–Fri 09:00–17:00) for existing tenants
-- This is a best-effort seed; conflicts are ignored.
INSERT INTO public.availability_rules (tenant_id, day_of_week, start_time, end_time, is_available)
SELECT
  t.id,
  d.day,
  '09:00'::time,
  '17:00'::time,
  (d.day BETWEEN 1 AND 5)  -- weekdays available, weekends off
FROM public.tenants t
CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6)) AS d(day)
ON CONFLICT (tenant_id, day_of_week) DO NOTHING;

-- ── 4. blocked_times ──────────────────────────────────────────────────────────
-- Admin-defined time blocks that override availability (holidays, closures, etc.)

CREATE TABLE IF NOT EXISTS public.blocked_times (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time   timestamptz NOT NULL,
  reason     text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blocked_times_tenant_idx ON public.blocked_times (tenant_id);
CREATE INDEX IF NOT EXISTS blocked_times_start_idx  ON public.blocked_times (start_time);
CREATE INDEX IF NOT EXISTS blocked_times_range_idx  ON public.blocked_times (tenant_id, start_time, end_time);

ALTER TABLE public.blocked_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.blocked_times
  FOR ALL USING (true) WITH CHECK (true);

-- ── 5. RLS tightening for appointments ───────────────────────────────────────
-- These supplement the blanket service_role_all policy with auth-uid policies
-- for direct client-side access (anon-key consumers).

-- Admin/owner: full access within their tenant
CREATE POLICY "appointments_admin_access" ON public.appointments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin', 'owner')
        AND (u.tenant_id = appointments.tenant_id OR u.role = 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin', 'owner')
        AND (u.tenant_id = appointments.tenant_id OR u.role = 'owner')
    )
  );

-- Customer: can only read/write their own appointments within their tenant
CREATE POLICY "appointments_customer_own" ON public.appointments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_accounts ca
      WHERE ca.auth_user_id  = auth.uid()
        AND ca.tenant_id     = appointments.tenant_id
        AND ca.customer_id   = appointments.customer_id
        AND ca.status        = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customer_accounts ca
      WHERE ca.auth_user_id  = auth.uid()
        AND ca.tenant_id     = appointments.tenant_id
        AND ca.customer_id   = appointments.customer_id
        AND ca.status        = 'active'
    )
  );
