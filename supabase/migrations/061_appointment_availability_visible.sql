-- ============================================================
-- Migration 061: Appointment Availability — Visible System Fix
-- Idempotent supplement to migrations 010, 049, and 060.
-- Ensures all tables, columns, indexes, and RLS policies exist
-- in the correct form so the Availability Block Manager works.
-- ============================================================

-- ── Ensure appointment_availability_blocks exists ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.appointment_availability_blocks (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_id                    uuid        NULL,
  title                       text        NULL,
  description                 text        NULL,
  block_type                  text        NOT NULL DEFAULT 'available'
                                          CHECK (block_type IN ('available', 'unavailable', 'blackout')),
  day_of_week                 integer     NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time                  time        NULL,
  end_time                    time        NULL,
  start_at                    timestamptz NULL,
  end_at                      timestamptz NULL,
  timezone                    text        NOT NULL DEFAULT 'America/Los_Angeles',
  is_recurring                boolean     NOT NULL DEFAULT true,
  recurrence_rule             text        NULL,
  max_bookings                integer     NOT NULL DEFAULT 1 CHECK (max_bookings >= 1),
  appointment_duration_minutes integer    NOT NULL DEFAULT 30 CHECK (appointment_duration_minutes >= 5),
  buffer_before_minutes       integer     NOT NULL DEFAULT 0  CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes        integer     NOT NULL DEFAULT 0  CHECK (buffer_after_minutes >= 0),
  is_active                   boolean     NOT NULL DEFAULT true,
  created_by                  uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Add columns that may be missing from earlier versions of this table
ALTER TABLE public.appointment_availability_blocks
  ADD COLUMN IF NOT EXISTS description                text        NULL,
  ADD COLUMN IF NOT EXISTS block_type                 text        NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS day_of_week               integer     NULL,
  ADD COLUMN IF NOT EXISTS start_time                time        NULL,
  ADD COLUMN IF NOT EXISTS end_time                  time        NULL,
  ADD COLUMN IF NOT EXISTS start_at                  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS end_at                    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS timezone                  text        NOT NULL DEFAULT 'America/Los_Angeles',
  ADD COLUMN IF NOT EXISTS is_recurring              boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recurrence_rule           text        NULL,
  ADD COLUMN IF NOT EXISTS max_bookings              integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS appointment_duration_minutes integer  NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS buffer_before_minutes     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_minutes      integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active                 boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by                uuid        NULL,
  ADD COLUMN IF NOT EXISTS updated_at                timestamptz NOT NULL DEFAULT now();

-- Add check constraint on block_type (safe — only adds if column value is already valid)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'appointment_availability_blocks'
      AND constraint_name = 'appointment_availability_blocks_block_type_check'
  ) THEN
    ALTER TABLE public.appointment_availability_blocks
      ADD CONSTRAINT appointment_availability_blocks_block_type_check
      CHECK (block_type IN ('available', 'unavailable', 'blackout'));
  END IF;
END $$;

-- ── Ensure professionals table is referenced properly ────────────────────────
-- The app uses `professionals` (from migration 049) for staff_id FK.
-- Wire it up if the table exists and the FK is not already set.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='professionals') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'appointment_availability_blocks'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name = 'appointment_availability_blocks_staff_id_fkey'
    ) THEN
      ALTER TABLE public.appointment_availability_blocks
        ADD CONSTRAINT appointment_availability_blocks_staff_id_fkey
        FOREIGN KEY (staff_id) REFERENCES public.professionals(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ── Extend appointments table ─────────────────────────────────────────────────

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS staff_id   uuid NULL,
  ADD COLUMN IF NOT EXISTS service_id uuid NULL;

-- Wire staff_id FK to professionals if that table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='professionals') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'appointments'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name = 'appointments_staff_id_fkey'
    ) THEN
      ALTER TABLE public.appointments
        ADD CONSTRAINT appointments_staff_id_fkey
        FOREIGN KEY (staff_id) REFERENCES public.professionals(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ── Ensure appointment_services table exists ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.appointment_services (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  description      text        NULL,
  duration_minutes integer     NOT NULL DEFAULT 30,
  price_cents      integer     NULL,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Ensure all columns exist (table may be from an earlier partial migration)
ALTER TABLE public.appointment_services
  ADD COLUMN IF NOT EXISTS description      text        NULL,
  ADD COLUMN IF NOT EXISTS duration_minutes integer     NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS price_cents      integer     NULL,
  ADD COLUMN IF NOT EXISTS is_active        boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();

-- Wire service_id FK to appointment_services
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'appointments'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'appointments_service_id_fkey'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES public.appointment_services(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS appointment_availability_blocks_tenant_idx
  ON public.appointment_availability_blocks (tenant_id);

CREATE INDEX IF NOT EXISTS appointment_availability_blocks_staff_idx
  ON public.appointment_availability_blocks (staff_id);

CREATE INDEX IF NOT EXISTS appointment_availability_blocks_tenant_active_idx
  ON public.appointment_availability_blocks (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS appointment_availability_blocks_tenant_type_idx
  ON public.appointment_availability_blocks (tenant_id, block_type);

CREATE INDEX IF NOT EXISTS appointment_availability_blocks_recurring_idx
  ON public.appointment_availability_blocks (tenant_id, is_recurring, day_of_week);

CREATE INDEX IF NOT EXISTS appointment_services_tenant_idx
  ON public.appointment_services (tenant_id);

CREATE INDEX IF NOT EXISTS appointments_staff_id_idx
  ON public.appointments (staff_id);

-- ── Enable RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.appointment_availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_services            ENABLE ROW LEVEL SECURITY;

-- ── RLS: appointment_availability_blocks ──────────────────────────────────────

-- Drop and recreate so this migration is fully idempotent
DROP POLICY IF EXISTS "service_role_full_access_availability_blocks"   ON public.appointment_availability_blocks;
DROP POLICY IF EXISTS "owner_admin_manage_availability_blocks"         ON public.appointment_availability_blocks;
DROP POLICY IF EXISTS "staff_select_availability_blocks"               ON public.appointment_availability_blocks;
DROP POLICY IF EXISTS "staff_update_own_availability_blocks"           ON public.appointment_availability_blocks;
DROP POLICY IF EXISTS "customers_select_active_available_blocks"       ON public.appointment_availability_blocks;

-- service_role bypass
CREATE POLICY "service_role_full_access_availability_blocks"
  ON public.appointment_availability_blocks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- owner/admin: full CRUD on their tenant's blocks
CREATE POLICY "owner_admin_manage_availability_blocks"
  ON public.appointment_availability_blocks
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('owner', 'admin')
    )
  );

-- staff: select their tenant's blocks
CREATE POLICY "staff_select_availability_blocks"
  ON public.appointment_availability_blocks
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- staff: update blocks assigned to their own professionals row
CREATE POLICY "staff_update_own_availability_blocks"
  ON public.appointment_availability_blocks
  FOR UPDATE
  TO authenticated
  USING (
    staff_id IN (
      SELECT p.id FROM public.professionals p
      JOIN public.users u ON u.tenant_id = p.tenant_id
      WHERE u.auth_user_id = auth.uid()
        AND p.email = u.email
    )
  );

-- customers: see active available blocks only (for storefront booking)
CREATE POLICY "customers_select_active_available_blocks"
  ON public.appointment_availability_blocks
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND block_type = 'available'
  );

-- ── RLS: appointment_services ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "service_role_full_access_appointment_services" ON public.appointment_services;
DROP POLICY IF EXISTS "owner_admin_manage_appointment_services"        ON public.appointment_services;
DROP POLICY IF EXISTS "all_select_active_appointment_services"         ON public.appointment_services;

CREATE POLICY "service_role_full_access_appointment_services"
  ON public.appointment_services
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "owner_admin_manage_appointment_services"
  ON public.appointment_services
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "all_select_active_appointment_services"
  ON public.appointment_services
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
    )
    AND is_active = true
  );

-- ── Updated-at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS appointment_availability_blocks_updated_at ON public.appointment_availability_blocks;
CREATE TRIGGER appointment_availability_blocks_updated_at
  BEFORE UPDATE ON public.appointment_availability_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS appointment_services_updated_at ON public.appointment_services;
CREATE TRIGGER appointment_services_updated_at
  BEFORE UPDATE ON public.appointment_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
