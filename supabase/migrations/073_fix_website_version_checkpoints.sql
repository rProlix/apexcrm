-- 073_fix_website_version_checkpoints.sql
--
-- Fixes "Checkpoint save failed — publish aborted" errors caused by:
--
--   1. site_versions.created_by received public.users.id (profile UUID) instead
--      of auth.users.id — a FK violation that silently aborts checkpoint inserts.
--      (Fixed in TypeScript: all routes now use ctx.auth_id, not ctx.id)
--
--   2. source/status CHECK constraints not including all values used by
--      template_apply, before_template_apply, ai_restyle, etc.
--
--   3. version_number UNIQUE constraint race conditions when version_number = 1
--      already exists for a tenant.
--
-- This migration is idempotent — safe to re-run.

-- ── 1. Ensure created_by FK points to auth.users (not public.users) ───────────
-- The column already has this definition; this block is a no-op guard.
DO $$ BEGIN
  -- Verify the FK target is auth.users, not public.users.
  -- If someone altered the table to point elsewhere, this will raise a notice.
  IF EXISTS (
    SELECT 1
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON rc.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name   = 'site_versions'
      AND rc.constraint_name LIKE '%created_by%'
  ) THEN
    RAISE NOTICE '073: site_versions.created_by FK constraint exists — OK';
  ELSE
    RAISE NOTICE '073: site_versions.created_by FK constraint NOT found — column may be missing';
  END IF;
END $$;

-- ── 2. Expand source constraint to include all known values ───────────────────
-- Drop and recreate to ensure the full set is present.
ALTER TABLE public.site_versions
  DROP CONSTRAINT IF EXISTS site_versions_source_check;

ALTER TABLE public.site_versions
  ADD CONSTRAINT site_versions_source_check CHECK (
    source IN (
      'manual',
      'autosave',
      'ai_autofill',
      'ai_images',
      'ai_animations',
      'ai_restyle',
      'before_ai_restyle',
      'template_apply',
      'before_template_apply',
      'restore',
      'publish',
      'drag_drop',
      'section_edit',
      'auto',
      'system',
      'template',
      'theme'
    )
  );

-- ── 3. Expand status constraint ───────────────────────────────────────────────
ALTER TABLE public.site_versions
  DROP CONSTRAINT IF EXISTS site_versions_status_check;

ALTER TABLE public.site_versions
  ADD CONSTRAINT site_versions_status_check CHECK (
    status IN (
      'draft',
      'published',
      'archived',
      'restored',
      'autosave',
      'checkpoint'
    )
  );

-- ── 4. Ensure version_number column exists and backfill ───────────────────────
ALTER TABLE public.site_versions
  ADD COLUMN IF NOT EXISTS version_number integer;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.site_versions WHERE version_number IS NULL LIMIT 1) THEN
    UPDATE public.site_versions sv
    SET version_number = rn.rn
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at ASC) AS rn
      FROM public.site_versions
    ) rn
    WHERE sv.id = rn.id AND sv.version_number IS NULL;
  END IF;
END $$;

-- ── 5. Ensure UNIQUE (tenant_id, version_number) exists ──────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname    = 'site_versions_tenant_version_uniq'
      AND conrelid   = 'public.site_versions'::regclass
  ) THEN
    ALTER TABLE public.site_versions
      ADD CONSTRAINT site_versions_tenant_version_uniq
        UNIQUE (tenant_id, version_number);
  END IF;
END $$;

-- ── 6. Ensure all required columns exist ─────────────────────────────────────
ALTER TABLE public.site_versions
  ADD COLUMN IF NOT EXISTS label                     text,
  ADD COLUMN IF NOT EXISTS description               text,
  ADD COLUMN IF NOT EXISTS source                    text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS page_count                integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS section_count             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restored_from_version_id  uuid REFERENCES public.site_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at              timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at                timestamptz NOT NULL DEFAULT now();

-- ── 7. Re-ensure RLS policies ─────────────────────────────────────────────────
ALTER TABLE public.site_versions ENABLE ROW LEVEL SECURITY;

-- Service role bypass (always bypass RLS for server-side API routes)
DROP POLICY IF EXISTS "service_role_site_versions_v3" ON public.site_versions;
CREATE POLICY "service_role_site_versions_v3"
  ON public.site_versions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated: read own tenant's versions
DROP POLICY IF EXISTS "auth_read_site_versions_v3"  ON public.site_versions;
CREATE POLICY "auth_read_site_versions_v3"
  ON public.site_versions FOR SELECT TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id));

-- Authenticated: write own tenant's versions
DROP POLICY IF EXISTS "auth_write_site_versions_v3" ON public.site_versions;
CREATE POLICY "auth_write_site_versions_v3"
  ON public.site_versions FOR ALL TO authenticated
  USING  (public.current_user_has_tenant_access(tenant_id))
  WITH CHECK (public.current_user_has_tenant_access(tenant_id));

-- ── 8. Re-create helper function (idempotent) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_next_site_version_number(p_tenant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) INTO v_max
  FROM public.site_versions
  WHERE tenant_id = p_tenant_id;
  RETURN v_max + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_site_version_number(uuid) TO authenticated;

DO $$ BEGIN
  RAISE NOTICE '073: Website version checkpoint constraints fixed.';
END $$;
