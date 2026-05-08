-- supabase/migrations/049_appointments_staff_upgrade.sql
-- Appointments Staff Upgrade: professionals, availability blocks, and staff-scoped scheduling.
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING / DROP … IF EXISTS).

-- ── 1. professionals ──────────────────────────────────────────────────────────
-- Bookable professionals / employees for appointment scheduling.
-- Separate from auth users table — a professional record is about SERVICE DELIVERY,
-- not system access. An auth user can optionally be linked but is not required.

CREATE TABLE IF NOT EXISTS public.professionals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  email       text,
  phone       text,
  role        text        NOT NULL DEFAULT 'staff',
  avatar_url  text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS professionals_tenant_idx        ON public.professionals (tenant_id);
CREATE INDEX IF NOT EXISTS professionals_tenant_active_idx ON public.professionals (tenant_id, is_active);

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

-- service role: full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'professionals' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.professionals
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- admin/owner: read own tenant's professionals
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'professionals' AND policyname = 'professionals_admin_access'
  ) THEN
    CREATE POLICY "professionals_admin_access" ON public.professionals
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('admin', 'owner')
            AND (u.tenant_id = professionals.tenant_id OR u.role = 'owner')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('admin', 'owner')
            AND (u.tenant_id = professionals.tenant_id OR u.role = 'owner')
        )
      );
  END IF;
END $$;

-- staff (login user): read professionals in same tenant
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'professionals' AND policyname = 'professionals_staff_read'
  ) THEN
    CREATE POLICY "professionals_staff_read" ON public.professionals
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role = 'staff'
            AND u.tenant_id = professionals.tenant_id
            AND u.status = 'active'
        )
      );
  END IF;
END $$;


-- ── 2. appointment_availability_blocks ────────────────────────────────────────
-- Business-created blocks of available time for booking.
-- Supports recurring (weekly) and one-time blocks, optionally staff-scoped.

CREATE TABLE IF NOT EXISTS public.appointment_availability_blocks (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL REFERENCES public.tenants(id)       ON DELETE CASCADE,
  staff_id                 uuid        REFERENCES public.professionals(id)          ON DELETE SET NULL,
  title                    text,
  -- Recurring block: uses day_of_week + start_time + end_time
  day_of_week              integer     CHECK (day_of_week BETWEEN 0 AND 6),
  start_time               time,
  end_time                 time,
  -- One-time block: uses starts_at + ends_at
  starts_at                timestamptz,
  ends_at                  timestamptz,
  timezone                 text        NOT NULL DEFAULT 'America/Los_Angeles',
  slot_duration_minutes    integer     NOT NULL DEFAULT 30,
  buffer_before_minutes    integer     NOT NULL DEFAULT 0,
  buffer_after_minutes     integer     NOT NULL DEFAULT 0,
  max_bookings_per_slot    integer     NOT NULL DEFAULT 1,
  is_recurring             boolean     NOT NULL DEFAULT true,
  is_active                boolean     NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS avail_blocks_tenant_idx         ON public.appointment_availability_blocks (tenant_id);
CREATE INDEX IF NOT EXISTS avail_blocks_tenant_staff_idx   ON public.appointment_availability_blocks (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS avail_blocks_tenant_active_idx  ON public.appointment_availability_blocks (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS avail_blocks_tenant_dow_idx     ON public.appointment_availability_blocks (tenant_id, day_of_week);
CREATE INDEX IF NOT EXISTS avail_blocks_range_idx          ON public.appointment_availability_blocks (starts_at, ends_at)
  WHERE starts_at IS NOT NULL;

ALTER TABLE public.appointment_availability_blocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'appointment_availability_blocks' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.appointment_availability_blocks
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'appointment_availability_blocks' AND policyname = 'avail_blocks_admin_access'
  ) THEN
    CREATE POLICY "avail_blocks_admin_access" ON public.appointment_availability_blocks
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('admin', 'owner')
            AND (u.tenant_id = appointment_availability_blocks.tenant_id OR u.role = 'owner')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('admin', 'owner')
            AND (u.tenant_id = appointment_availability_blocks.tenant_id OR u.role = 'owner')
        )
      );
  END IF;
END $$;

-- Customers can read active availability blocks (to show available times)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'appointment_availability_blocks' AND policyname = 'avail_blocks_customer_read'
  ) THEN
    CREATE POLICY "avail_blocks_customer_read" ON public.appointment_availability_blocks
      FOR SELECT
      USING (
        is_active = true
        AND EXISTS (
          SELECT 1 FROM public.customer_accounts ca
          WHERE ca.auth_user_id = auth.uid()
            AND ca.tenant_id = appointment_availability_blocks.tenant_id
            AND ca.status = 'active'
        )
      );
  END IF;
END $$;


-- ── 3. Extend appointments table ──────────────────────────────────────────────

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS staff_id              uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_block_id  uuid REFERENCES public.appointment_availability_blocks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_staff_idx         ON public.appointments (staff_id)   WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointments_tenant_staff_idx  ON public.appointments (tenant_id, staff_id) WHERE staff_id IS NOT NULL;

-- ── 4. Normalise status check (add no_show, rescheduled safely) ──────────────
-- Drop old constraint first so we can expand the allowed values
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

-- Normalise any existing non-standard values
UPDATE public.appointments SET status = 'pending'   WHERE status IN ('scheduled', 'new');
UPDATE public.appointments SET status = 'canceled'  WHERE status IN ('cancelled', 'no_show', 'rescheduled');

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'canceled'));
