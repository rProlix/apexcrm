-- ============================================================
-- Migration 034: Fix PostgREST FK Ambiguity — product_360_packages ↔ products
-- ============================================================
-- Problem:
--   PostgREST throws "Could not embed because more than one relationship was
--   found for 'product_360_packages' and 'products'" because TWO FK paths
--   exist between these two tables:
--
--     Path A (forward):  product_360_packages.product_id → products(id)
--     Path B (reverse):  products.spin_package_id → product_360_packages(id)
--
--   Path B was intentionally added in migration 026 for the Store module's
--   product↔package link and CANNOT be dropped (it is actively used by the
--   Store admin UI and attach API).
--
-- Fix strategy:
--   1. Guarantee that the forward FK (Path A) has a canonical, predictable
--      constraint name: product_360_packages_product_id_fkey
--      The application code uses the PostgREST hint syntax
--      products!product_360_packages_product_id_fkey to unambiguously select
--      Path A. This eliminates the runtime error without any schema changes.
--   2. Similarly canonicalise the tenant_id and frames.package_id FKs.
--   3. Add missing columns from the canonical spec (preset label, is_primary
--      alias for is_default, starts_at/ends_at aliases for promo windows).
--   4. Ensure all required indexes exist.
--
-- Safe: idempotent via DO $$ … $$ guards + IF NOT EXISTS / IF EXISTS checks.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1 — Canonicalise product_360_packages.product_id FK name
-- ─────────────────────────────────────────────────────────────────────────────
-- PostgreSQL auto-names REFERENCES constraints as {table}_{col}_fkey, so the
-- name is almost certainly already correct. This block renames it only if it
-- differs (e.g., a legacy migration gave it a custom name).

DO $$
DECLARE
  v_fk text;
BEGIN
  SELECT pc.conname INTO v_fk
  FROM   pg_constraint pc
  JOIN   pg_class      pr ON pr.oid = pc.conrelid
  JOIN   pg_class      pf ON pf.oid = pc.confrelid
  WHERE  pr.relname = 'product_360_packages'
    AND  pf.relname = 'products'
    AND  pc.contype = 'f'
    AND  pc.conname <> 'product_360_packages_product_id_fkey'
  LIMIT  1;

  IF v_fk IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE product_360_packages RENAME CONSTRAINT %I TO product_360_packages_product_id_fkey',
      v_fk
    );
    RAISE NOTICE 'Renamed FK % → product_360_packages_product_id_fkey', v_fk;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2 — Canonicalise product_360_packages.tenant_id FK name
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_fk text;
BEGIN
  SELECT pc.conname INTO v_fk
  FROM   pg_constraint pc
  JOIN   pg_class      pr ON pr.oid = pc.conrelid
  JOIN   pg_class      pf ON pf.oid = pc.confrelid
  WHERE  pr.relname = 'product_360_packages'
    AND  pf.relname = 'tenants'
    AND  pc.contype = 'f'
    AND  pc.conname <> 'product_360_packages_tenant_id_fkey'
  LIMIT  1;

  IF v_fk IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE product_360_packages RENAME CONSTRAINT %I TO product_360_packages_tenant_id_fkey',
      v_fk
    );
    RAISE NOTICE 'Renamed FK % → product_360_packages_tenant_id_fkey', v_fk;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3 — Canonicalise product_360_frames.package_id FK name
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_fk text;
BEGIN
  SELECT pc.conname INTO v_fk
  FROM   pg_constraint pc
  JOIN   pg_class      pr ON pr.oid = pc.conrelid
  JOIN   pg_class      pf ON pf.oid = pc.confrelid
  WHERE  pr.relname = 'product_360_frames'
    AND  pf.relname = 'product_360_packages'
    AND  pc.contype = 'f'
    AND  pc.conname <> 'product_360_frames_package_id_fkey'
  LIMIT  1;

  IF v_fk IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE product_360_frames RENAME CONSTRAINT %I TO product_360_frames_package_id_fkey',
      v_fk
    );
    RAISE NOTICE 'Renamed FK % → product_360_frames_package_id_fkey', v_fk;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4 — Add missing columns
-- ─────────────────────────────────────────────────────────────────────────────

-- Generic preset shorthand (a single label like "standard", "premium", etc.)
-- distinct from the individual lighting/camera/background preset columns.
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS preset text;

-- is_primary — user-facing alias for is_default.
-- Both columns coexist; a trigger keeps them in sync.
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Backfill is_primary from is_default for existing rows.
UPDATE product_360_packages
SET    is_primary = is_default
WHERE  is_primary IS DISTINCT FROM is_default;

-- starts_at / ends_at — shorter aliases for promo_starts_at / promo_ends_at
-- that the website-builder and API can use interchangeably.
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at   timestamptz;

UPDATE product_360_packages
SET    starts_at = promo_starts_at
WHERE  starts_at IS NULL AND promo_starts_at IS NOT NULL;

UPDATE product_360_packages
SET    ends_at = promo_ends_at
WHERE  ends_at IS NULL AND promo_ends_at IS NOT NULL;

-- generation_model — canonical alias for ai_model
-- (ai_model was added in migration 033; both names are kept so nothing breaks)
ALTER TABLE product_360_packages
  ADD COLUMN IF NOT EXISTS generation_model text;

UPDATE product_360_packages
SET    generation_model = ai_model
WHERE  generation_model IS NULL AND ai_model IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5 — Keep is_primary in sync with is_default via a trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_p360_pkg_is_primary()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- When is_default changes, mirror to is_primary (and vice-versa).
  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_default IS DISTINCT FROM OLD.is_default THEN
      NEW.is_primary := NEW.is_default;
    ELSIF NEW.is_primary IS DISTINCT FROM OLD.is_primary THEN
      NEW.is_default := NEW.is_primary;
    END IF;
  END IF;
  -- On INSERT initialise both to the same value.
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_primary THEN
      NEW.is_default := true;
    ELSIF NEW.is_default THEN
      NEW.is_primary := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p360_pkg_sync_primary ON product_360_packages;
CREATE TRIGGER trg_p360_pkg_sync_primary
  BEFORE INSERT OR UPDATE ON product_360_packages
  FOR EACH ROW EXECUTE FUNCTION sync_p360_pkg_is_primary();

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6 — Keep starts_at / ends_at in sync with promo_starts_at / promo_ends_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_p360_pkg_promo_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    -- promo_ columns are canonical; mirror to the short aliases.
    IF NEW.promo_starts_at IS DISTINCT FROM OLD.promo_starts_at
        OR TG_OP = 'INSERT' THEN
      NEW.starts_at := NEW.promo_starts_at;
    ELSIF NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
      NEW.promo_starts_at := NEW.starts_at;
    END IF;

    IF NEW.promo_ends_at IS DISTINCT FROM OLD.promo_ends_at
        OR TG_OP = 'INSERT' THEN
      NEW.ends_at := NEW.promo_ends_at;
    ELSIF NEW.ends_at IS DISTINCT FROM OLD.ends_at THEN
      NEW.promo_ends_at := NEW.ends_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p360_pkg_sync_promo_dates ON product_360_packages;
CREATE TRIGGER trg_p360_pkg_sync_promo_dates
  BEFORE INSERT OR UPDATE ON product_360_packages
  FOR EACH ROW EXECUTE FUNCTION sync_p360_pkg_promo_dates();

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 7 — Partial unique index: one primary per tenant/product
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop legacy index names first to avoid conflicts.
DROP INDEX IF EXISTS p360_pkg_default_uidx;
DROP INDEX IF EXISTS p360_pkg_primary_uidx;

-- Enforces one primary (is_primary=true) package per tenant+product combo.
CREATE UNIQUE INDEX IF NOT EXISTS p360_pkg_primary_uidx
  ON product_360_packages(tenant_id, product_id)
  WHERE is_primary = true AND product_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 8 — Ensure required indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS p360_pkg_tenant_id_idx    ON product_360_packages(tenant_id);
CREATE INDEX IF NOT EXISTS p360_pkg_product_id_idx   ON product_360_packages(product_id);
CREATE INDEX IF NOT EXISTS p360_pkg_is_enabled_idx   ON product_360_packages(tenant_id, is_enabled);
CREATE INDEX IF NOT EXISTS p360_frames_pkg_idx       ON product_360_frames(package_id);
CREATE INDEX IF NOT EXISTS p360_frames_tenant_prod_idx ON product_360_frames(tenant_id, product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 9 — Storage bucket for generated frames
-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket name: product-360-frames
-- Store paths: {tenant_id}/{product_id}/{package_id}/frame-0001.png
--
-- Supabase storage policies are RLS policies on storage.objects, NOT rows in
-- a storage.policies table (that table does not exist).
-- We create the bucket and apply an RLS policy on storage.objects.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage')
     AND EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'storage' AND table_name = 'buckets')
  THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('product-360-frames', 'product-360-frames', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END;
$$;

-- RLS policy: service role has full access to the product-360-frames bucket.
-- Supabase storage policies are standard Postgres RLS policies on storage.objects.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage')
     AND EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'storage' AND table_name = 'objects')
  THEN
    -- Drop the policy first so this block is idempotent.
    DROP POLICY IF EXISTS "service_role_p360_frames_all" ON storage.objects;

    CREATE POLICY "service_role_p360_frames_all"
      ON storage.objects
      FOR ALL
      TO service_role
      USING (bucket_id = 'product-360-frames')
      WITH CHECK (bucket_id = 'product-360-frames');
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: Application code must use the explicit FK hint in every query that
-- embeds products from product_360_packages, for example:
--
--   .select('*, product:products!product_360_packages_product_id_fkey(name)')
--
-- The hint tells PostgREST to use Path A (forward FK) rather than Path B
-- (reverse FK products.spin_package_id → product_360_packages(id)).
-- ─────────────────────────────────────────────────────────────────────────────
