-- ============================================================
-- 068_fix_website_versioning_checkpoints.sql
-- Fixes constraint violations that silently block checkpoint creation.
-- Expands allowed source/status/event_type values.
-- Ensures all three versioning tables exist with correct schema.
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. Fix site_versions source constraint ────────────────────────────────────
-- Drop the old constraint (may not exist yet if 067 added it)
ALTER TABLE public.site_versions
  DROP CONSTRAINT IF EXISTS site_versions_source_check;

-- Recreate with full allowed list (includes ai_animations, auto, system)
ALTER TABLE public.site_versions
  ADD CONSTRAINT site_versions_source_check CHECK (
    source IN (
      'manual',
      'autosave',
      'ai_autofill',
      'ai_images',
      'ai_animations',
      'restore',
      'publish',
      'drag_drop',
      'section_edit',
      'auto',
      'system'
    )
  );

-- ── 2. Fix site_versions status constraint ────────────────────────────────────
ALTER TABLE public.site_versions
  DROP CONSTRAINT IF EXISTS site_versions_status_check;

ALTER TABLE public.site_versions
  ADD CONSTRAINT site_versions_status_check CHECK (
    status IN ('draft', 'published', 'archived', 'restored', 'autosave')
  );

-- ── 3. Fix website_version_events event_type constraint ───────────────────────
-- Drop old constraint so new event types (from publish, AI apply, etc.) are allowed
ALTER TABLE public.website_version_events
  DROP CONSTRAINT IF EXISTS website_version_events_type_check;

-- Recreate with full list — use a permissive length check instead of exhaustive enum
-- This means any non-empty string up to 64 chars is valid, preventing future breakage
ALTER TABLE public.website_version_events
  ADD CONSTRAINT website_version_events_type_check CHECK (
    char_length(event_type) > 0 AND char_length(event_type) <= 64
  );

-- ── 4. Ensure site_versions has all required columns ─────────────────────────
ALTER TABLE public.site_versions
  ADD COLUMN IF NOT EXISTS version_number       integer,
  ADD COLUMN IF NOT EXISTS label                text,
  ADD COLUMN IF NOT EXISTS description          text,
  ADD COLUMN IF NOT EXISTS source               text        NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS page_count           integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS section_count        integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restored_from_version_id uuid    REFERENCES public.site_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at         timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz NOT NULL DEFAULT now();

-- Backfill version_number if any are still null
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.site_versions WHERE version_number IS NULL LIMIT 1) THEN
    UPDATE public.site_versions sv
    SET version_number = rn.rn
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at ASC) AS rn
      FROM public.site_versions
    ) rn
    WHERE sv.id = rn.id AND sv.version_number IS NULL;
  END IF;
END $$;

-- Unique constraint: tenant_id + version_number (idempotent — checks pg_constraint first)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_versions_tenant_version_uniq'
      AND conrelid = 'public.site_versions'::regclass
  ) THEN
    ALTER TABLE public.site_versions
      ADD CONSTRAINT site_versions_tenant_version_uniq UNIQUE (tenant_id, version_number);
  END IF;
END $$;

-- Extra indexes
CREATE INDEX IF NOT EXISTS idx_site_versions_tenant_source  ON public.site_versions (tenant_id, source);
CREATE INDEX IF NOT EXISTS idx_site_versions_tenant_created ON public.site_versions (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_versions_tenant_status  ON public.site_versions (tenant_id, status);

-- ── 5. Ensure website_builder_drafts exists ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.website_builder_drafts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  draft_snapshot      jsonb       NOT NULL DEFAULT '{}',
  base_version_id     uuid        REFERENCES public.site_versions(id) ON DELETE SET NULL,
  dirty               boolean     NOT NULL DEFAULT false,
  last_autosaved_at   timestamptz,
  updated_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wbd_tenant  ON public.website_builder_drafts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_wbd_updated ON public.website_builder_drafts (updated_at DESC);

-- ── 6. Ensure website_version_events exists ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.website_version_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_id  uuid        REFERENCES public.site_versions(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_version_events_type_check_v2 CHECK (
    char_length(event_type) > 0 AND char_length(event_type) <= 64
  )
);

CREATE INDEX IF NOT EXISTS idx_wve_tenant_created  ON public.website_version_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wve_version_created ON public.website_version_events (version_id, created_at DESC);

-- ── 7. Enable RLS on all three tables ────────────────────────────────────────
ALTER TABLE public.site_versions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_version_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_builder_drafts ENABLE ROW LEVEL SECURITY;

-- Service role bypass (re-ensure)
DROP POLICY IF EXISTS "service_role_site_versions_v2"  ON public.site_versions;
CREATE POLICY "service_role_site_versions_v2"
  ON public.site_versions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_wve_v2" ON public.website_version_events;
CREATE POLICY "service_role_wve_v2"
  ON public.website_version_events FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_wbd_v2" ON public.website_builder_drafts;
CREATE POLICY "service_role_wbd_v2"
  ON public.website_builder_drafts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated user policies
DROP POLICY IF EXISTS "auth_read_site_versions"  ON public.site_versions;
CREATE POLICY "auth_read_site_versions"
  ON public.site_versions FOR SELECT TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "auth_write_site_versions" ON public.site_versions;
CREATE POLICY "auth_write_site_versions"
  ON public.site_versions FOR ALL TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id))
  WITH CHECK (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "auth_read_wve"  ON public.website_version_events;
CREATE POLICY "auth_read_wve"
  ON public.website_version_events FOR SELECT TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "auth_write_wve" ON public.website_version_events;
CREATE POLICY "auth_write_wve"
  ON public.website_version_events FOR ALL TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id))
  WITH CHECK (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "auth_all_wbd" ON public.website_builder_drafts;
CREATE POLICY "auth_all_wbd"
  ON public.website_builder_drafts FOR ALL TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id))
  WITH CHECK (public.current_user_has_tenant_access(tenant_id));

-- ── 8. Ensure the helper function exists ─────────────────────────────────────
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
  RAISE NOTICE 'Migration 068: Website versioning constraints fixed.';
END $$;
