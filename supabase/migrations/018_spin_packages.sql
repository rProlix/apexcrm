-- supabase/migrations/018_spin_packages.sql
-- 360 Spin Package Module: spin_packages, spin_images, products FK extension
-- All tables scoped by tenant_id. Service-role client bypasses RLS in API routes.

-- ─────────────────────────────────────────────────────────────────────────────
-- spin_packages
-- Each record represents a 360° spin set for one product.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spin_packages (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id         uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status             text        NOT NULL DEFAULT 'draft'
    CONSTRAINT spin_packages_status_check
      CHECK (status IN ('draft', 'generating', 'ready', 'failed')),
  prompt_text        text        NOT NULL,
  image_count        integer     NOT NULL DEFAULT 24
    CONSTRAINT spin_packages_image_count_check CHECK (image_count BETWEEN 8 AND 72),
  midjourney_job_id  text,
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spin_packages_tenant_id_idx  ON spin_packages(tenant_id);
CREATE INDEX IF NOT EXISTS spin_packages_product_id_idx ON spin_packages(product_id);
CREATE INDEX IF NOT EXISTS spin_packages_status_idx     ON spin_packages(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- spin_images
-- One row per rendered frame in a spin package.
-- frame_index is 0-based (0 = front, increments clockwise).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spin_images (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  spin_package_id  uuid        NOT NULL REFERENCES spin_packages(id) ON DELETE CASCADE,
  tenant_id        uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  image_url        text        NOT NULL,
  storage_path     text,
  frame_index      integer     NOT NULL
    CONSTRAINT spin_images_frame_index_check CHECK (frame_index >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spin_images_unique_frame UNIQUE (spin_package_id, frame_index)
);

CREATE INDEX IF NOT EXISTS spin_images_spin_package_id_idx ON spin_images(spin_package_id);
CREATE INDEX IF NOT EXISTS spin_images_tenant_id_idx       ON spin_images(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend products: nullable FK to the assigned spin package
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS spin_package_id uuid
    REFERENCES spin_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_spin_package_id_idx ON products(spin_package_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_spin_packages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spin_packages_updated_at ON spin_packages;
CREATE TRIGGER trg_spin_packages_updated_at
  BEFORE UPDATE ON spin_packages
  FOR EACH ROW EXECUTE FUNCTION update_spin_packages_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- Service role bypasses all RLS. Anon/authenticated access gated below.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE spin_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE spin_images   ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY service_role_spin_packages ON spin_packages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_spin_images ON spin_images
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users: read only within their tenant (viewer RLS)
-- Full RBAC (owner/admin) is enforced in code; this policy is a safety net.
CREATE POLICY tenant_read_spin_packages ON spin_packages
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE auth_user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY tenant_read_spin_images ON spin_images
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE auth_user_id = auth.uid()
        AND status = 'active'
    )
  );

-- Public (anon) can read spin_images for published packages — enables customer 360 viewer
CREATE POLICY public_read_ready_spin_images ON spin_images
  FOR SELECT TO anon
  USING (
    spin_package_id IN (
      SELECT id FROM spin_packages WHERE status = 'ready'
    )
  );

CREATE POLICY public_read_ready_spin_packages ON spin_packages
  FOR SELECT TO anon
  USING (status = 'ready');
