-- ============================================================
-- Migration 026: Consolidate 360 Product Viewer Module
-- ============================================================
-- Merges three parallel 360 implementations into one canonical system:
--   product_360_packages + product_360_frames + products.spin_package_id
--
-- Old systems (left intact for data safety, no longer used by app):
--   spin_packages / spin_images (migration 018)
--   product_360_spins JSONB (migration 019)
--   products.p360_package_id (migration 024)
--
-- Canonical system after this migration:
--   product_360_packages  — one package per product/generation
--   product_360_frames    — per-row frames (progress-trackable)
--   products.spin_package_id → product_360_packages.id
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Augment product_360_packages with canonical columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS description     text,
  ADD COLUMN IF NOT EXISTS source_type     text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by      uuid;

-- Make product_id nullable (canonical schema allows packages without a product attached yet)
ALTER TABLE product_360_packages ALTER COLUMN product_id DROP NOT NULL;

-- Make name NOT NULL with a default
ALTER TABLE product_360_packages ALTER COLUMN name SET DEFAULT 'Untitled 360 Package';
UPDATE product_360_packages SET name = 'Untitled 360 Package' WHERE name IS NULL;
ALTER TABLE product_360_packages ALTER COLUMN name SET NOT NULL;

-- ─── Status constraint update ────────────────────────────────────────────────
-- Old values: pending, generating, complete, failed
-- New canonical: draft, queued, generating, ready, failed

ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_status_check;

-- Migrate old status values to canonical names
UPDATE product_360_packages SET status = 'draft' WHERE status = 'pending';
UPDATE product_360_packages SET status = 'ready' WHERE status = 'complete';

ALTER TABLE product_360_packages
  ALTER COLUMN status SET DEFAULT 'draft',
  ADD CONSTRAINT p360_pkg_status_check
    CHECK (status IN ('draft', 'queued', 'generating', 'ready', 'failed'));

-- ─── source_type constraint ───────────────────────────────────────────────────
ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_source_type_check;
ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_source_type_check
    CHECK (source_type IN ('manual', 'ai'));

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Augment product_360_frames with canonical columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE product_360_frames
  ADD COLUMN IF NOT EXISTS tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS angle_degrees integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS width         integer,
  ADD COLUMN IF NOT EXISTS height        integer;

-- Backfill tenant_id from parent package
UPDATE product_360_frames f
SET tenant_id = p.tenant_id
FROM product_360_packages p
WHERE f.package_id = p.id
  AND f.tenant_id IS NULL;

-- Add index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS p360_frames_tenant_idx ON product_360_frames(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Canonical FK on products table
-- products.spin_package_id → product_360_packages(id)
--
-- The old products.spin_package_id (from migration 018) references spin_packages.
-- We drop that column and re-create it pointing at product_360_packages.
-- We also copy any data from p360_package_id before dropping it.
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. Drop the OLD spin_package_id (references spin_packages — old Three.js system)
--     Only if it still references spin_packages (safe to drop; old system retired)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'spin_package_id'
  ) THEN
    -- Check if the FK points to spin_packages (old system)
    IF EXISTS (
      SELECT 1 FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = rc.constraint_name
      JOIN information_schema.key_column_usage kcu2
        ON kcu2.constraint_name = rc.unique_constraint_name
      WHERE kcu.table_name = 'products'
        AND kcu.column_name = 'spin_package_id'
        AND kcu2.table_name = 'spin_packages'
    ) THEN
      ALTER TABLE products DROP COLUMN spin_package_id;
    END IF;
  END IF;
END;
$$;

-- 3b. Add new canonical spin_package_id → product_360_packages
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS spin_package_id uuid
    REFERENCES product_360_packages(id) ON DELETE SET NULL;

-- 3c. Copy data from p360_package_id (migration 024 column) into spin_package_id
UPDATE products
SET spin_package_id = p360_package_id
WHERE p360_package_id IS NOT NULL
  AND spin_package_id IS NULL;

-- 3d. Drop the old p360_package_id column (data is now in spin_package_id)
ALTER TABLE products DROP COLUMN IF EXISTS p360_package_id;

-- 3e. Update product_360_packages.product_id references if any products
--     had p360_package_id set but package.product_id was missing
UPDATE product_360_packages pkg
SET product_id = p.id
FROM products p
WHERE p.spin_package_id = pkg.id
  AND pkg.product_id IS NULL;

-- Create canonical index
CREATE INDEX IF NOT EXISTS products_spin_package_id_idx ON products(spin_package_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: updated_at trigger (ensure it exists with canonical function name)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_p360_pkg_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p360_pkg_updated_at ON product_360_packages;
CREATE TRIGGER trg_p360_pkg_updated_at
  BEFORE UPDATE ON product_360_packages
  FOR EACH ROW EXECUTE FUNCTION update_p360_pkg_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Idempotent RLS Policies
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE product_360_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_360_frames   ENABLE ROW LEVEL SECURITY;

-- ── product_360_packages ─────────────────────────────────────────────────────

-- Service role: full access (bypasses RLS for API routes)
DROP POLICY IF EXISTS svc_p360_packages ON product_360_packages;
CREATE POLICY svc_p360_packages ON product_360_packages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Owner: can access all packages across all tenants
DROP POLICY IF EXISTS owner_p360_packages ON product_360_packages;
CREATE POLICY owner_p360_packages ON product_360_packages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    )
  );

-- Admin: can access only their tenant's packages
DROP POLICY IF EXISTS admin_p360_packages ON product_360_packages;
CREATE POLICY admin_p360_packages ON product_360_packages
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'staff')
        AND status = 'active'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE auth_user_id = auth.uid()
        AND role = 'admin'
        AND status = 'active'
    )
  );

-- Public anon: only ready packages (for storefront)
DROP POLICY IF EXISTS anon_read_ready_p360_packages ON product_360_packages;
CREATE POLICY anon_read_ready_p360_packages ON product_360_packages
  FOR SELECT TO anon
  USING (status = 'ready');

-- Remove old policies from migration 024 that conflict
DROP POLICY IF EXISTS svc_p360_frames ON product_360_packages;
DROP POLICY IF EXISTS auth_read_p360_packages ON product_360_packages;
DROP POLICY IF EXISTS anon_read_complete_p360_packages ON product_360_packages;

-- ── product_360_frames ───────────────────────────────────────────────────────

-- Service role
DROP POLICY IF EXISTS svc_p360_frames ON product_360_frames;
CREATE POLICY svc_p360_frames ON product_360_frames
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Owner: full access
DROP POLICY IF EXISTS owner_p360_frames ON product_360_frames;
CREATE POLICY owner_p360_frames ON product_360_frames
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    )
  );

-- Admin/staff: tenant-scoped access
DROP POLICY IF EXISTS admin_p360_frames ON product_360_frames;
CREATE POLICY admin_p360_frames ON product_360_frames
  FOR ALL TO authenticated
  USING (
    package_id IN (
      SELECT id FROM product_360_packages
      WHERE tenant_id IN (
        SELECT tenant_id FROM users
        WHERE auth_user_id = auth.uid()
          AND role IN ('admin', 'staff')
          AND status = 'active'
      )
    )
  )
  WITH CHECK (
    package_id IN (
      SELECT id FROM product_360_packages
      WHERE tenant_id IN (
        SELECT tenant_id FROM users
        WHERE auth_user_id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
      )
    )
  );

-- Public anon: only frames belonging to ready packages
DROP POLICY IF EXISTS anon_read_ready_p360_frames ON product_360_frames;
CREATE POLICY anon_read_ready_p360_frames ON product_360_frames
  FOR SELECT TO anon
  USING (
    package_id IN (
      SELECT id FROM product_360_packages WHERE status = 'ready'
    )
  );

-- Remove old conflicting policies from migration 024
DROP POLICY IF EXISTS auth_read_p360_frames ON product_360_frames;
DROP POLICY IF EXISTS anon_read_complete_p360_frames ON product_360_frames;
