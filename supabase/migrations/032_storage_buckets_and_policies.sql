-- 032_storage_buckets_and_policies.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Full Supabase Storage setup for the entire Nexora / ApexCRM SaaS platform.
--
-- Creates all application buckets with correct public/private settings,
-- then establishes comprehensive RLS policies on storage.objects using
-- JWT claims (auth.jwt() ->> 'tenant_id' / 'role') that are set during
-- authentication (see migration 020_onboarding.sql).
--
-- Auth claim shape (set by Supabase Auth hooks):
--   auth.jwt() ->> 'tenant_id'  → uuid of the tenant the user belongs to
--   auth.jwt() ->> 'role'       → 'owner' | 'admin' | 'staff' | 'customer'
--
-- Storage path conventions:
--   Public buckets:  tenants/{tenantId}/...
--   Private buckets: tenants/{tenantId}/...
--
-- Bucket notes:
--   031_website_assets_bucket.sql already created website-assets and its
--   basic policies. This migration uses ON CONFLICT DO NOTHING / DO UPDATE
--   to be idempotent, then drops/recreates ALL storage policies so they are
--   consistent across the whole app.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — Helper functions
-- ═══════════════════════════════════════════════════════════════════════════

-- current_tenant_id() may already exist from migration 020.
-- Create it only if absent.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_tenant_id'
  ) THEN
    CREATE OR REPLACE FUNCTION public.current_tenant_id()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $body$
      SELECT COALESCE(
        (auth.jwt() ->> 'tenant_id')::uuid,
        current_setting('app.current_tenant_id', true)::uuid
      )
    $body$;
  END IF;
END $$;

-- is_owner(): true when the authenticated user has role = 'owner'.
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() ->> 'role', '') = 'owner'
$$;

-- is_tenant_admin(p_tenant_id): true for owner OR admin of that tenant.
CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (
    public.is_owner()
    OR (
      COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
      AND public.current_tenant_id() = p_tenant_id
    )
  )
$$;

-- is_tenant_member(p_tenant_id): true for any authenticated user of that tenant.
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (
    public.is_owner()
    OR public.current_tenant_id() = p_tenant_id
  )
$$;

-- current_customer_id(): returns the customer row id for the authenticated
-- customer user (via customer_accounts.auth_user_id link).
CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM public.customer_accounts
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — Bucket creation
-- ═══════════════════════════════════════════════════════════════════════════
-- All sizes are in bytes. ON CONFLICT DO UPDATE ensures idempotent re-runs.
-- website-assets is re-stated here to ensure public=true is consistent.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  -- ── Public buckets ────────────────────────────────────────────────────────
  (
    'website-assets', 'website-assets', true, 10485760,         -- 10 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/svg+xml']
  ),
  (
    'product-assets', 'product-assets', true, 15728640,         -- 15 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
  ),
  (
    'spin-360-assets', 'spin-360-assets', true, 26214400,       -- 25 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp']
  ),
  (
    'brand-assets', 'brand-assets', true, 5242880,              -- 5 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/svg+xml','image/x-icon']
  ),
  -- ── Private buckets ───────────────────────────────────────────────────────
  (
    'customer-assets', 'customer-assets', false, 20971520,      -- 20 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','application/pdf','text/plain']
  ),
  (
    'appointment-assets', 'appointment-assets', false, 20971520, -- 20 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','application/pdf']
  ),
  (
    'damage-assessment-assets', 'damage-assessment-assets', false, 31457280, -- 30 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','application/pdf']
  ),
  (
    'document-assets', 'document-assets', false, 26214400,      -- 25 MB
    ARRAY['application/pdf','text/plain','application/json','image/jpeg','image/png','image/webp']
  ),
  (
    'import-assets', 'import-assets', false, 31457280,          -- 30 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','text/plain','application/json']
  ),
  (
    'temp-assets', 'temp-assets', false, 20971520,              -- 20 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf','text/plain']
  )
ON CONFLICT (id) DO UPDATE
  SET
    public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — Drop stale policies before recreating
-- ═══════════════════════════════════════════════════════════════════════════
-- Policy names follow: {bucket_snake}_{action}_{scope}

DO $$ DECLARE
  p text;
  policies text[] := ARRAY[
    -- website-assets (originally created in 031 — superseded here)
    'website_assets_public_read',
    'website_assets_authenticated_insert',
    'website_assets_authenticated_update',
    'website_assets_authenticated_delete',
    -- new canonical policies
    'website_assets_read',
    'website_assets_owner_admin_insert',
    'website_assets_owner_admin_update',
    'website_assets_owner_admin_delete',
    'product_assets_read',
    'product_assets_owner_admin_insert',
    'product_assets_owner_admin_update',
    'product_assets_owner_admin_delete',
    'spin_360_assets_read',
    'spin_360_assets_owner_admin_insert',
    'spin_360_assets_owner_admin_update',
    'spin_360_assets_owner_admin_delete',
    'brand_assets_read',
    'brand_assets_owner_admin_insert',
    'brand_assets_owner_admin_update',
    'brand_assets_owner_admin_delete',
    'customer_assets_customer_read',
    'customer_assets_customer_insert',
    'customer_assets_admin_read',
    'customer_assets_admin_insert',
    'customer_assets_admin_update',
    'customer_assets_admin_delete',
    'appointment_assets_admin_read',
    'appointment_assets_admin_insert',
    'appointment_assets_admin_update',
    'appointment_assets_admin_delete',
    'appointment_assets_customer_read',
    'damage_assets_admin_read',
    'damage_assets_admin_insert',
    'damage_assets_admin_update',
    'damage_assets_admin_delete',
    'document_assets_admin_read',
    'document_assets_admin_insert',
    'document_assets_admin_update',
    'document_assets_admin_delete',
    'document_assets_customer_read',
    'import_assets_admin_read',
    'import_assets_admin_insert',
    'import_assets_admin_update',
    'import_assets_admin_delete',
    'temp_assets_owner_admin_read',
    'temp_assets_owner_admin_insert',
    'temp_assets_owner_admin_update',
    'temp_assets_owner_admin_delete',
    'temp_assets_customer_insert',
    'temp_assets_customer_read'
  ];
BEGIN
  FOREACH p IN ARRAY policies LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = p
    ) THEN
      EXECUTE format('DROP POLICY %I ON storage.objects', p);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — Public bucket policies
-- ═══════════════════════════════════════════════════════════════════════════
-- website-assets, product-assets, spin-360-assets, brand-assets:
--   SELECT: anyone (no auth required)
--   INSERT/UPDATE/DELETE: owner OR admin of the matching tenant path

-- ── 4a. website-assets ──────────────────────────────────────────────────────

CREATE POLICY "website_assets_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'website-assets');

CREATE POLICY "website_assets_owner_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'website-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

CREATE POLICY "website_assets_owner_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'website-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

CREATE POLICY "website_assets_owner_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'website-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

-- ── 4b. product-assets ──────────────────────────────────────────────────────

CREATE POLICY "product_assets_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-assets');

CREATE POLICY "product_assets_owner_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

CREATE POLICY "product_assets_owner_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'product-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

CREATE POLICY "product_assets_owner_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

-- ── 4c. spin-360-assets ─────────────────────────────────────────────────────

CREATE POLICY "spin_360_assets_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'spin-360-assets');

CREATE POLICY "spin_360_assets_owner_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'spin-360-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

CREATE POLICY "spin_360_assets_owner_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'spin-360-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

CREATE POLICY "spin_360_assets_owner_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'spin-360-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

-- ── 4d. brand-assets ────────────────────────────────────────────────────────

CREATE POLICY "brand_assets_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-assets');

CREATE POLICY "brand_assets_owner_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

CREATE POLICY "brand_assets_owner_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'brand-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

CREATE POLICY "brand_assets_owner_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'brand-assets'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin', 'staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — Private bucket policies
-- ═══════════════════════════════════════════════════════════════════════════
-- No public SELECT. Access requires auth + tenant match or customer link.

-- ── 5a. customer-assets ─────────────────────────────────────────────────────
-- Path: tenants/{tenantId}/customers/{customerId}/...
--
-- Admin/owner: full access within tenant.
-- Customer: can read/write only their own path (tenants/{tid}/customers/{cid}).

CREATE POLICY "customer_assets_admin_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'customer-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "customer_assets_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'customer-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "customer_assets_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'customer-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "customer_assets_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'customer-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

-- Customer can read/write only their own customer folder:
--   tenants/{tenantId}/customers/{customerId}/...
-- (storage.foldername(name))[4] is the customerId segment.
CREATE POLICY "customer_assets_customer_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'customer-assets'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[4]::uuid = public.current_customer_id()
  );

CREATE POLICY "customer_assets_customer_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'customer-assets'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[4]::uuid = public.current_customer_id()
  );

-- ── 5b. appointment-assets ──────────────────────────────────────────────────
-- Path: tenants/{tenantId}/appointments/{appointmentId}/...

CREATE POLICY "appointment_assets_admin_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'appointment-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "appointment_assets_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'appointment-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "appointment_assets_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'appointment-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "appointment_assets_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'appointment-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

-- Customer can read appointment files for their own appointments only.
-- Links via appointments.customer_id = customer_accounts.id.
CREATE POLICY "appointment_assets_customer_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'appointment-assets'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.id::text = (storage.foldername(name))[4]
        AND a.customer_id = public.current_customer_id()
    )
  );

-- ── 5c. damage-assessment-assets ────────────────────────────────────────────
-- Path: tenants/{tenantId}/damage/{vehicleId_or_bookingId}/{assessmentId}/...
-- No public read. No customer write. Signed URLs only.

CREATE POLICY "damage_assets_admin_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'damage-assessment-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "damage_assets_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'damage-assessment-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "damage_assets_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'damage-assessment-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "damage_assets_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'damage-assessment-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

-- ── 5d. document-assets ─────────────────────────────────────────────────────
-- Path: tenants/{tenantId}/documents/{category}/{recordId_or_global}/{fileName}

CREATE POLICY "document_assets_admin_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'document-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "document_assets_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'document-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "document_assets_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'document-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "document_assets_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'document-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

-- ── 5e. import-assets ───────────────────────────────────────────────────────
-- Path: tenants/{tenantId}/imports/{importJobId}/{fileName}
-- Owner/admin only — customers never touch this bucket.

CREATE POLICY "import_assets_admin_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'import-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "import_assets_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'import-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "import_assets_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'import-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "import_assets_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'import-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

-- ── 5f. temp-assets ─────────────────────────────────────────────────────────
-- Path: tenants/{tenantId}/temp/{userId}/{timestamp}-{fileName}

CREATE POLICY "temp_assets_owner_admin_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'temp-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "temp_assets_owner_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'temp-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "temp_assets_owner_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'temp-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

CREATE POLICY "temp_assets_owner_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'temp-assets'
    AND auth.role() = 'authenticated'
    AND public.is_tenant_admin((storage.foldername(name))[2]::uuid)
  );

-- Customer can insert/read only their own temp files (path contains their auth.uid()).
CREATE POLICY "temp_assets_customer_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'temp-assets'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[4] = auth.uid()::text
  );

CREATE POLICY "temp_assets_customer_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'temp-assets'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[4] = auth.uid()::text
  );
