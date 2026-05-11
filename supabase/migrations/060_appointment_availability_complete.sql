-- supabase/migrations/060_appointment_availability_complete.sql
-- Complete appointment availability system.
-- FULLY IDEMPOTENT: safe to run whether or not migration 049 was applied.
-- CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS guards every column.

-- ── 1. professionals ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professionals (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  email      text,
  phone      text,
  role       text        NOT NULL DEFAULT 'staff',
  avatar_url text,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure columns exist even if table was created by a prior migration without them
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS email      text,
  ADD COLUMN IF NOT EXISTS phone      text,
  ADD COLUMN IF NOT EXISTS role       text        NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS is_active  boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS professionals_tenant_idx        ON public.professionals (tenant_id);
CREATE INDEX IF NOT EXISTS professionals_tenant_active_idx ON public.professionals (tenant_id, is_active);

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='professionals' AND policyname='service_role_all') THEN
    CREATE POLICY "service_role_all" ON public.professionals FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='professionals' AND policyname='professionals_admin_access') THEN
    CREATE POLICY "professionals_admin_access" ON public.professionals
      FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.role IN ('admin','owner')
          AND (u.tenant_id = professionals.tenant_id OR u.role = 'owner')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.role IN ('admin','owner')
          AND (u.tenant_id = professionals.tenant_id OR u.role = 'owner')
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='professionals' AND policyname='professionals_staff_read') THEN
    CREATE POLICY "professionals_staff_read" ON public.professionals
      FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.role = 'staff'
          AND u.tenant_id = professionals.tenant_id
          AND u.status = 'active'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='professionals' AND policyname='professionals_customer_read') THEN
    CREATE POLICY "professionals_customer_read" ON public.professionals
      FOR SELECT
      USING (
        is_active = true
        AND EXISTS (
          SELECT 1 FROM public.customer_accounts ca
          WHERE ca.auth_user_id = auth.uid()
            AND ca.tenant_id = professionals.tenant_id
            AND ca.status = 'active'
        )
      );
  END IF;
END $$;


-- ── 2. appointment_availability_blocks ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_availability_blocks (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_id              uuid        REFERENCES public.professionals(id) ON DELETE SET NULL,
  title                 text,
  day_of_week           integer     CHECK (day_of_week BETWEEN 0 AND 6),
  start_time            time,
  end_time              time,
  starts_at             timestamptz,
  ends_at               timestamptz,
  timezone              text        NOT NULL DEFAULT 'America/Los_Angeles',
  slot_duration_minutes integer     NOT NULL DEFAULT 30,
  buffer_before_minutes integer     NOT NULL DEFAULT 0,
  buffer_after_minutes  integer     NOT NULL DEFAULT 0,
  max_bookings_per_slot integer     NOT NULL DEFAULT 1,
  is_recurring          boolean     NOT NULL DEFAULT true,
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Ensure all columns exist (handles table created by prior migration without these fields)
ALTER TABLE public.appointment_availability_blocks
  ADD COLUMN IF NOT EXISTS staff_id              uuid        REFERENCES public.professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title                 text,
  ADD COLUMN IF NOT EXISTS day_of_week           integer,
  ADD COLUMN IF NOT EXISTS start_time            time,
  ADD COLUMN IF NOT EXISTS end_time              time,
  ADD COLUMN IF NOT EXISTS starts_at             timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at               timestamptz,
  ADD COLUMN IF NOT EXISTS timezone              text        NOT NULL DEFAULT 'America/Los_Angeles',
  ADD COLUMN IF NOT EXISTS slot_duration_minutes integer     NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS buffer_before_minutes integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_minutes  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_bookings_per_slot integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_recurring          boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active             boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at            timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz NOT NULL DEFAULT now();

-- New columns added in migration 060
ALTER TABLE public.appointment_availability_blocks
  ADD COLUMN IF NOT EXISTS block_type      text        NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS description     text,
  ADD COLUMN IF NOT EXISTS recurrence_rule text,
  ADD COLUMN IF NOT EXISTS created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add day_of_week constraint safely
ALTER TABLE public.appointment_availability_blocks
  DROP CONSTRAINT IF EXISTS appointment_availability_blocks_day_of_week_check;
ALTER TABLE public.appointment_availability_blocks
  ADD CONSTRAINT appointment_availability_blocks_day_of_week_check
  CHECK (day_of_week BETWEEN 0 AND 6);

-- Add block_type constraint safely
ALTER TABLE public.appointment_availability_blocks
  DROP CONSTRAINT IF EXISTS appointment_availability_blocks_block_type_check;
ALTER TABLE public.appointment_availability_blocks
  ADD CONSTRAINT appointment_availability_blocks_block_type_check
  CHECK (block_type IN ('available', 'unavailable', 'blackout'));

CREATE INDEX IF NOT EXISTS avail_blocks_tenant_idx        ON public.appointment_availability_blocks (tenant_id);
CREATE INDEX IF NOT EXISTS avail_blocks_tenant_staff_idx  ON public.appointment_availability_blocks (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS avail_blocks_tenant_active_idx ON public.appointment_availability_blocks (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS avail_blocks_tenant_dow_idx    ON public.appointment_availability_blocks (tenant_id, day_of_week);
CREATE INDEX IF NOT EXISTS avail_blocks_type_idx          ON public.appointment_availability_blocks (tenant_id, block_type);
CREATE INDEX IF NOT EXISTS avail_blocks_range_idx         ON public.appointment_availability_blocks (starts_at, ends_at) WHERE starts_at IS NOT NULL;

ALTER TABLE public.appointment_availability_blocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appointment_availability_blocks' AND policyname='service_role_all') THEN
    CREATE POLICY "service_role_all" ON public.appointment_availability_blocks FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appointment_availability_blocks' AND policyname='avail_blocks_admin_access') THEN
    CREATE POLICY "avail_blocks_admin_access" ON public.appointment_availability_blocks
      FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.role IN ('admin','owner')
          AND (u.tenant_id = appointment_availability_blocks.tenant_id OR u.role = 'owner')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.role IN ('admin','owner')
          AND (u.tenant_id = appointment_availability_blocks.tenant_id OR u.role = 'owner')
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appointment_availability_blocks' AND policyname='avail_blocks_staff_read') THEN
    CREATE POLICY "avail_blocks_staff_read" ON public.appointment_availability_blocks
      FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.role = 'staff'
          AND u.tenant_id = appointment_availability_blocks.tenant_id
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appointment_availability_blocks' AND policyname='avail_blocks_customer_read') THEN
    CREATE POLICY "avail_blocks_customer_read" ON public.appointment_availability_blocks
      FOR SELECT
      USING (
        is_active = true
        AND block_type = 'available'
        AND EXISTS (
          SELECT 1 FROM public.customer_accounts ca
          WHERE ca.auth_user_id = auth.uid()
            AND ca.tenant_id = appointment_availability_blocks.tenant_id
            AND ca.status = 'active'
        )
      );
  END IF;
END $$;


-- ── 3. Extend appointments ────────────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS staff_id             uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_block_id uuid REFERENCES public.appointment_availability_blocks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_staff_idx        ON public.appointments (staff_id)            WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointments_tenant_staff_idx ON public.appointments (tenant_id, staff_id) WHERE staff_id IS NOT NULL;

-- Normalise status constraint
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
UPDATE public.appointments SET status = 'pending'  WHERE status IN ('scheduled', 'new');
UPDATE public.appointments SET status = 'canceled' WHERE status IN ('cancelled');
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'canceled', 'no_show', 'rescheduled'));


-- ── 4. appointment_services ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_services (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  description      text,
  duration_minutes integer     NOT NULL DEFAULT 30,
  price_cents      integer,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Ensure all columns present if table pre-existed
ALTER TABLE public.appointment_services
  ADD COLUMN IF NOT EXISTS description      text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer     NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS price_cents      integer,
  ADD COLUMN IF NOT EXISTS is_active        boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();

-- Drop and re-add duration_minutes constraint safely
ALTER TABLE public.appointment_services
  DROP CONSTRAINT IF EXISTS appointment_services_duration_minutes_check;
ALTER TABLE public.appointment_services
  ADD CONSTRAINT appointment_services_duration_minutes_check
  CHECK (duration_minutes >= 5);

CREATE INDEX IF NOT EXISTS appt_services_tenant_idx ON public.appointment_services (tenant_id);
CREATE INDEX IF NOT EXISTS appt_services_active_idx ON public.appointment_services (tenant_id, is_active);

ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appointment_services' AND policyname='service_role_all') THEN
    CREATE POLICY "service_role_all" ON public.appointment_services FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appointment_services' AND policyname='appt_services_admin_access') THEN
    CREATE POLICY "appt_services_admin_access" ON public.appointment_services
      FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.role IN ('admin','owner')
          AND (u.tenant_id = appointment_services.tenant_id OR u.role = 'owner')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.role IN ('admin','owner')
          AND (u.tenant_id = appointment_services.tenant_id OR u.role = 'owner')
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appointment_services' AND policyname='appt_services_read') THEN
    CREATE POLICY "appt_services_read" ON public.appointment_services
      FOR SELECT
      USING (is_active = true);
  END IF;
END $$;


-- ── 5. staff_services ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_services (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id)              ON DELETE CASCADE,
  staff_id   uuid        NOT NULL REFERENCES public.professionals(id)        ON DELETE CASCADE,
  service_id uuid        NOT NULL REFERENCES public.appointment_services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, staff_id, service_id)
);

ALTER TABLE public.staff_services
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS staff_services_tenant_idx  ON public.staff_services (tenant_id);
CREATE INDEX IF NOT EXISTS staff_services_staff_idx   ON public.staff_services (staff_id);
CREATE INDEX IF NOT EXISTS staff_services_service_idx ON public.staff_services (service_id);

ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='staff_services' AND policyname='service_role_all') THEN
    CREATE POLICY "service_role_all" ON public.staff_services FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='staff_services' AND policyname='staff_services_admin_access') THEN
    CREATE POLICY "staff_services_admin_access" ON public.staff_services
      FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.role IN ('admin','owner')
          AND (u.tenant_id = staff_services.tenant_id OR u.role = 'owner')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.role IN ('admin','owner')
          AND (u.tenant_id = staff_services.tenant_id OR u.role = 'owner')
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='staff_services' AND policyname='staff_services_read') THEN
    CREATE POLICY "staff_services_read" ON public.staff_services FOR SELECT USING (true);
  END IF;
END $$;
