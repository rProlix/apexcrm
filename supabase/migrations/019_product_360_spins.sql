-- supabase/migrations/019_product_360_spins.sql
-- 360 Product Spin Module: product_360_spins table
-- Stores ordered image URL arrays (jsonb) so the canvas viewer can load all frames
-- without individual row joins. Complements the previous spin_packages system.

-- ─────────────────────────────────────────────────────────────────────────────
-- product_360_spins
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_360_spins (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id    uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  prompt        text        NOT NULL,
  image_urls    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  total_frames  integer     NOT NULL DEFAULT 24
    CONSTRAINT product_360_spins_frames_check CHECK (total_frames BETWEEN 8 AND 72),
  status        text        NOT NULL DEFAULT 'generating'
    CONSTRAINT product_360_spins_status_check
      CHECK (status IN ('generating', 'ready', 'failed')),
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_360_spins_tenant_id_idx  ON product_360_spins(tenant_id);
CREATE INDEX IF NOT EXISTS product_360_spins_product_id_idx ON product_360_spins(product_id);
CREATE INDEX IF NOT EXISTS product_360_spins_status_idx     ON product_360_spins(status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_product_360_spins_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_360_spins_updated_at ON product_360_spins;
CREATE TRIGGER trg_product_360_spins_updated_at
  BEFORE UPDATE ON product_360_spins
  FOR EACH ROW EXECUTE FUNCTION update_product_360_spins_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Add spin_360_id FK to products (nullable; tracks which spin is "active")
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS spin_360_id uuid
    REFERENCES product_360_spins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_spin_360_id_idx ON products(spin_360_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE product_360_spins ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_product_360_spins ON product_360_spins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users: read within their tenant
CREATE POLICY tenant_read_product_360_spins ON product_360_spins
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

-- Anon can read ready spins (enables customer-facing viewer without auth)
CREATE POLICY public_read_ready_360_spins ON product_360_spins
  FOR SELECT TO anon
  USING (status = 'ready');
