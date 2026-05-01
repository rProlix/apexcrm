-- ============================================================
-- Migration 024: product_360_spin module
-- ============================================================
-- Introduces the "product_360_spin" module tables:
--   • product_360_packages  — one package per product per generation run
--   • product_360_frames    — individual frame rows (one per rendered angle)
--
-- Complements the existing product_360_spins (JSONB) table from migration 019.
-- This table pair uses per-frame rows, which allows incremental progress
-- tracking and future re-generation of individual frames.
--
-- Follows the same RLS pattern as spin_packages (018) and product_360_spins (019).
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- product_360_packages
-- One row per "spin shoot" — ties a product to an AI generation job.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_360_packages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  product_id    uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name          text,
  prompt        text,
  frame_count   integer     NOT NULL DEFAULT 24
    CONSTRAINT p360_pkg_frame_count_check CHECK (frame_count BETWEEN 8 AND 72),
  status        text        NOT NULL DEFAULT 'pending'
    CONSTRAINT p360_pkg_status_check
      CHECK (status IN ('pending', 'generating', 'complete', 'failed')),
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS p360_pkg_tenant_idx   ON product_360_packages(tenant_id);
CREATE INDEX IF NOT EXISTS p360_pkg_product_idx  ON product_360_packages(product_id);
CREATE INDEX IF NOT EXISTS p360_pkg_status_idx   ON product_360_packages(status);

-- updated_at trigger
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
-- product_360_frames
-- One row per rendered frame; frame_index is 0-based.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_360_frames (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  uuid        NOT NULL REFERENCES product_360_packages(id) ON DELETE CASCADE,
  frame_index integer     NOT NULL
    CONSTRAINT p360_frame_index_check CHECK (frame_index >= 0),
  image_url   text        NOT NULL,
  storage_path text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p360_frames_unique UNIQUE (package_id, frame_index)
);

CREATE INDEX IF NOT EXISTS p360_frames_pkg_idx ON product_360_frames(package_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Add p360_package_id FK to products (nullable)
-- Tracks the active 360 package for website builder rendering.
-- (products already have spin_package_id from 018 and spin_360_id from 019)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS p360_package_id uuid
    REFERENCES product_360_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_p360_package_id_idx ON products(p360_package_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE product_360_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_360_frames   ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY svc_p360_packages ON product_360_packages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY svc_p360_frames ON product_360_frames
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users: tenant-scoped read
CREATE POLICY auth_read_p360_packages ON product_360_packages
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY auth_read_p360_frames ON product_360_frames
  FOR SELECT TO authenticated
  USING (
    package_id IN (
      SELECT id FROM product_360_packages
      WHERE tenant_id IN (
        SELECT tenant_id FROM users
        WHERE auth_user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Anon can read complete packages and their frames (enables customer-facing viewer)
CREATE POLICY anon_read_complete_p360_packages ON product_360_packages
  FOR SELECT TO anon
  USING (status = 'complete');

CREATE POLICY anon_read_complete_p360_frames ON product_360_frames
  FOR SELECT TO anon
  USING (
    package_id IN (
      SELECT id FROM product_360_packages WHERE status = 'complete'
    )
  );
