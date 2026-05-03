-- ============================================================
-- Migration 027: 360 Product Studio — Final Consolidated Schema
-- ============================================================
-- Evolves the canonical product_360_* tables for multi-package support,
-- hotspots, generation jobs, promo scheduling, and module settings.
-- Renames module key from product_360_spin → product_360.
--
-- Safe to run multiple times (idempotent via IF NOT EXISTS / IF EXISTS).
-- ============================================================

-- ─── Rename module key in tenant_modules ──────────────────────────────────────
UPDATE tenant_modules
SET module_key = 'product_360'
WHERE module_key = 'product_360_spin';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Extend product_360_packages
-- ─────────────────────────────────────────────────────────────────────────────

-- Status: add 'archived' value
ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_status_check;
ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_status_check
    CHECK (status IN ('draft','queued','generating','ready','failed','archived'));

-- Slug (unique per tenant+product; generated from id if missing)
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS slug text;

-- Backfill slug from id for existing rows
UPDATE product_360_packages
SET slug = left(id::text, 8)
WHERE slug IS NULL;

-- Add NOT NULL after backfill
ALTER TABLE product_360_packages
  ALTER COLUMN slug SET NOT NULL;

-- Unique index on tenant_id + product_id + slug
CREATE UNIQUE INDEX IF NOT EXISTS p360_pkg_tenant_product_slug_uidx
  ON product_360_packages(tenant_id, product_id, slug)
  WHERE product_id IS NOT NULL;

-- Enabled / default flags
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS is_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_default   boolean NOT NULL DEFAULT false;

-- Partial unique index: only one default per tenant/product
DROP INDEX IF EXISTS p360_pkg_default_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS p360_pkg_default_uidx
  ON product_360_packages(tenant_id, product_id)
  WHERE is_default = true AND product_id IS NOT NULL;

-- Package type (replaces source_type for richer classification)
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'ai_generated';
ALTER TABLE product_360_packages
  DROP CONSTRAINT IF EXISTS p360_pkg_package_type_check;
ALTER TABLE product_360_packages
  ADD CONSTRAINT p360_pkg_package_type_check
    CHECK (package_type IN ('ai_generated','uploaded_frames','hybrid','model_3d'));

-- Migrate source_type → package_type for existing rows
UPDATE product_360_packages
SET package_type = CASE source_type
  WHEN 'ai'     THEN 'ai_generated'
  WHEN 'manual' THEN 'uploaded_frames'
  ELSE 'ai_generated'
END
WHERE package_type = 'ai_generated' AND source_type IS NOT NULL;

-- Frame counts
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS target_frame_count integer NOT NULL DEFAULT 36;

-- Sync frame_count as target if existing rows have frame_count set
UPDATE product_360_packages
SET target_frame_count = frame_count
WHERE target_frame_count = 36 AND frame_count > 0;

-- Promo scheduling
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS promo_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS promo_ends_at   timestamptz;

-- Generation columns (rename/add)
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS generation_prompt    text,
  ADD COLUMN IF NOT EXISTS negative_prompt      text,
  ADD COLUMN IF NOT EXISTS generation_provider  text NOT NULL DEFAULT 'imagine_midjourney',
  ADD COLUMN IF NOT EXISTS generation_job_id    text,
  ADD COLUMN IF NOT EXISTS generation_error     text;

-- Backfill generation_prompt from existing 'prompt' column if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_360_packages' AND column_name = 'prompt'
  ) THEN
    UPDATE product_360_packages
    SET generation_prompt = prompt
    WHERE generation_prompt IS NULL AND prompt IS NOT NULL;
  END IF;
END;
$$;

-- Hotspot / lighting / camera configs
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS hotspot_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lighting_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS camera_config   jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3D model support
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS model_url     text,
  ADD COLUMN IF NOT EXISTS ar_model_url  text,
  ADD COLUMN IF NOT EXISTS cover_frame_url text;

-- Backfill cover_frame_url from cover_image_url if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_360_packages' AND column_name = 'cover_image_url'
  ) THEN
    UPDATE product_360_packages
    SET cover_frame_url = cover_image_url
    WHERE cover_frame_url IS NULL AND cover_image_url IS NOT NULL;
  END IF;
END;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS p360_pkg_status_idx    ON product_360_packages(status);
CREATE INDEX IF NOT EXISTS p360_pkg_enabled_idx   ON product_360_packages(tenant_id, is_enabled);
CREATE INDEX IF NOT EXISTS p360_pkg_tenant_prod_idx ON product_360_packages(tenant_id, product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Extend product_360_frames
-- ─────────────────────────────────────────────────────────────────────────────

-- Add product_id denorm (avoids join for tenant-safety checks)
ALTER TABLE product_360_frames
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE CASCADE;

-- Backfill product_id from parent package
UPDATE product_360_frames f
SET product_id = p.product_id
FROM product_360_packages p
WHERE f.package_id = p.id
  AND f.product_id IS NULL
  AND p.product_id IS NOT NULL;

-- Rich metadata
ALTER TABLE product_360_frames
  ADD COLUMN IF NOT EXISTS file_size  integer,
  ADD COLUMN IF NOT EXISTS alt_text   text,
  ADD COLUMN IF NOT EXISTS metadata   jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Change angle_degrees to numeric for sub-degree precision
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_360_frames'
      AND column_name = 'angle_degrees'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE product_360_frames
      ALTER COLUMN angle_degrees TYPE numeric USING angle_degrees::numeric;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS p360_frames_product_idx ON product_360_frames(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: product_360_hotspots (new table)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_360_hotspots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id)               ON DELETE CASCADE,
  package_id  uuid        NOT NULL REFERENCES product_360_packages(id)  ON DELETE CASCADE,
  product_id  uuid        NOT NULL REFERENCES products(id)              ON DELETE CASCADE,
  frame_index integer,
  label       text        NOT NULL,
  description text,
  x           numeric     NOT NULL,
  y           numeric     NOT NULL,
  z           numeric,
  action_type text        NOT NULL DEFAULT 'info',
  action_value text,
  is_enabled  boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p360_hotspot_action_type_check
    CHECK (action_type IN ('info','link','add_to_cart','open_section','promo'))
);

CREATE INDEX IF NOT EXISTS p360_hotspots_tenant_idx  ON product_360_hotspots(tenant_id);
CREATE INDEX IF NOT EXISTS p360_hotspots_package_idx ON product_360_hotspots(package_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_p360_hotspot_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p360_hotspot_updated_at ON product_360_hotspots;
CREATE TRIGGER trg_p360_hotspot_updated_at
  BEFORE UPDATE ON product_360_hotspots
  FOR EACH ROW EXECUTE FUNCTION update_p360_hotspot_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: product_360_generation_jobs (new table)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_360_generation_jobs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id)               ON DELETE CASCADE,
  package_id          uuid        NOT NULL REFERENCES product_360_packages(id)  ON DELETE CASCADE,
  product_id          uuid        NOT NULL REFERENCES products(id)              ON DELETE CASCADE,
  requested_by        uuid        REFERENCES auth.users(id)                    ON DELETE SET NULL,
  provider            text        NOT NULL DEFAULT 'imagine_midjourney',
  provider_job_id     text,
  status              text        NOT NULL DEFAULT 'queued',
  prompt              text        NOT NULL,
  negative_prompt     text,
  target_frame_count  integer     NOT NULL DEFAULT 36,
  frames_completed    integer     NOT NULL DEFAULT 0,
  error_message       text,
  raw_response        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  completed_at        timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p360_job_status_check
    CHECK (status IN ('queued','running','completed','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS p360_jobs_tenant_idx   ON product_360_generation_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS p360_jobs_package_idx  ON product_360_generation_jobs(package_id);
CREATE INDEX IF NOT EXISTS p360_jobs_status_idx   ON product_360_generation_jobs(status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_p360_job_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p360_job_updated_at ON product_360_generation_jobs;
CREATE TRIGGER trg_p360_job_updated_at
  BEFORE UPDATE ON product_360_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION update_p360_job_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: product_360_module_settings (new table, one row per tenant)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_360_module_settings (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  default_frame_count     integer     NOT NULL DEFAULT 36,
  allow_ai_generation     boolean     NOT NULL DEFAULT true,
  allow_manual_upload     boolean     NOT NULL DEFAULT true,
  require_owner_approval  boolean     NOT NULL DEFAULT false,
  default_viewer_settings jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_p360_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p360_settings_updated_at ON product_360_module_settings;
CREATE TRIGGER trg_p360_settings_updated_at
  BEFORE UPDATE ON product_360_module_settings
  FOR EACH ROW EXECUTE FUNCTION update_p360_settings_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: RLS Policies (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE product_360_hotspots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_360_generation_jobs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_360_module_settings  ENABLE ROW LEVEL SECURITY;

-- Helper macro: is the current user an active owner?
-- (used inline in policies)

-- ── product_360_packages – updated policies ───────────────────────────────────

-- Update anon read policy to also check is_enabled and promo dates
DROP POLICY IF EXISTS anon_read_ready_p360_packages ON product_360_packages;
CREATE POLICY anon_read_ready_p360_packages ON product_360_packages
  FOR SELECT TO anon
  USING (
    status = 'ready'
    AND is_enabled = true
    AND (promo_starts_at IS NULL OR promo_starts_at <= now())
    AND (promo_ends_at   IS NULL OR promo_ends_at   >  now())
  );

-- ── product_360_hotspots ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS svc_p360_hotspots ON product_360_hotspots;
CREATE POLICY svc_p360_hotspots ON product_360_hotspots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS owner_p360_hotspots ON product_360_hotspots;
CREATE POLICY owner_p360_hotspots ON product_360_hotspots
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'owner' AND status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'owner' AND status = 'active'
  ));

DROP POLICY IF EXISTS admin_p360_hotspots ON product_360_hotspots;
CREATE POLICY admin_p360_hotspots ON product_360_hotspots
  FOR ALL TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
      AND role IN ('admin','staff') AND status = 'active'
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
      AND role = 'admin' AND status = 'active'
  ));

DROP POLICY IF EXISTS anon_p360_hotspots ON product_360_hotspots;
CREATE POLICY anon_p360_hotspots ON product_360_hotspots
  FOR SELECT TO anon
  USING (
    is_enabled = true
    AND package_id IN (
      SELECT id FROM product_360_packages
      WHERE status = 'ready' AND is_enabled = true
    )
  );

-- ── product_360_generation_jobs ───────────────────────────────────────────────

DROP POLICY IF EXISTS svc_p360_jobs ON product_360_generation_jobs;
CREATE POLICY svc_p360_jobs ON product_360_generation_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS owner_p360_jobs ON product_360_generation_jobs;
CREATE POLICY owner_p360_jobs ON product_360_generation_jobs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'owner' AND status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'owner' AND status = 'active'
  ));

DROP POLICY IF EXISTS admin_p360_jobs ON product_360_generation_jobs;
CREATE POLICY admin_p360_jobs ON product_360_generation_jobs
  FOR ALL TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
      AND role IN ('admin','staff') AND status = 'active'
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
      AND role = 'admin' AND status = 'active'
  ));

-- ── product_360_module_settings ───────────────────────────────────────────────

DROP POLICY IF EXISTS svc_p360_settings ON product_360_module_settings;
CREATE POLICY svc_p360_settings ON product_360_module_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS owner_p360_settings ON product_360_module_settings;
CREATE POLICY owner_p360_settings ON product_360_module_settings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'owner' AND status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'owner' AND status = 'active'
  ));

DROP POLICY IF EXISTS admin_p360_settings ON product_360_module_settings;
CREATE POLICY admin_p360_settings ON product_360_module_settings
  FOR ALL TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
      AND role = 'admin' AND status = 'active'
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM users WHERE auth_user_id = auth.uid()
      AND role = 'admin' AND status = 'active'
  ));
