-- ============================================================
-- 067_website_versioning.sql
-- Website version history, builder drafts, and version events.
-- Extends the existing site_versions table (from migration 007).
-- Idempotent — safe to re-run.
-- ============================================================

-- ── Extend site_versions with new columns ────────────────────────────────────
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

-- Add source CHECK if not already constrained
DO $$ BEGIN
  ALTER TABLE public.site_versions
    ADD CONSTRAINT site_versions_source_check
    CHECK (source IN ('manual','autosave','ai_autofill','ai_images','restore','publish','drag_drop','section_edit'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add status CHECK if not already constrained
DO $$ BEGIN
  ALTER TABLE public.site_versions
    ADD CONSTRAINT site_versions_status_check
    CHECK (status IN ('draft','published','archived','restored','autosave'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill version_number for existing rows (sequential per tenant)
DO $$ BEGIN
  -- Only backfill rows that don't have a version_number yet
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

-- Unique constraint: tenant_id + version_number
DO $$ BEGIN
  ALTER TABLE public.site_versions
    ADD CONSTRAINT site_versions_tenant_version_uniq UNIQUE (tenant_id, version_number);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes on site_versions
CREATE INDEX IF NOT EXISTS idx_site_versions_tenant_created     ON public.site_versions (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_versions_tenant_version     ON public.site_versions (tenant_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_site_versions_tenant_status      ON public.site_versions (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_site_versions_restored_from      ON public.site_versions (restored_from_version_id);

-- updated_at trigger for site_versions
DROP TRIGGER IF EXISTS site_versions_updated_at ON public.site_versions;
CREATE TRIGGER site_versions_updated_at
  BEFORE UPDATE ON public.site_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── website_version_events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.website_version_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_id  uuid        REFERENCES public.site_versions(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_version_events_type_check CHECK (
    event_type IN (
      'created','updated','published','restored','archived','autosaved',
      'ai_applied','sections_reordered','section_created','section_updated','section_deleted'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_wve_tenant_created   ON public.website_version_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wve_version_created  ON public.website_version_events (version_id, created_at DESC);

-- ── website_builder_drafts ────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_wbd_tenant      ON public.website_builder_drafts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_wbd_updated     ON public.website_builder_drafts (updated_at DESC);

DROP TRIGGER IF EXISTS wbd_updated_at ON public.website_builder_drafts;
CREATE TRIGGER wbd_updated_at
  BEFORE UPDATE ON public.website_builder_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.site_versions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_version_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_builder_drafts ENABLE ROW LEVEL SECURITY;

-- Service role bypass
DROP POLICY IF EXISTS "service_role_site_versions"         ON public.site_versions;
DROP POLICY IF EXISTS "service_role_wve"                   ON public.website_version_events;
DROP POLICY IF EXISTS "service_role_wbd"                   ON public.website_builder_drafts;

CREATE POLICY "service_role_site_versions"
  ON public.site_versions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_wve"
  ON public.website_version_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_wbd"
  ON public.website_builder_drafts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tenant staff read access
DROP POLICY IF EXISTS "staff_read_site_versions"  ON public.site_versions;
CREATE POLICY "staff_read_site_versions"
  ON public.site_versions FOR SELECT TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "admin_write_site_versions" ON public.site_versions;
CREATE POLICY "admin_write_site_versions"
  ON public.site_versions FOR ALL TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id))
  WITH CHECK (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "staff_read_wve"  ON public.website_version_events;
CREATE POLICY "staff_read_wve"
  ON public.website_version_events FOR SELECT TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "admin_write_wve" ON public.website_version_events;
CREATE POLICY "admin_write_wve"
  ON public.website_version_events FOR ALL TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id))
  WITH CHECK (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "admin_all_wbd"   ON public.website_builder_drafts;
CREATE POLICY "admin_all_wbd"
  ON public.website_builder_drafts FOR ALL TO authenticated
  USING (public.current_user_has_tenant_access(tenant_id))
  WITH CHECK (public.current_user_has_tenant_access(tenant_id));

-- ── Helper: get next version number for a tenant ─────────────────────────────
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

-- ── Helper: archive old published versions ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_old_published_versions_archived(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.site_versions
  SET status = 'archived'
  WHERE tenant_id = p_tenant_id
    AND status = 'published';
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_old_published_versions_archived(uuid) TO authenticated;

-- ── Backfill sort_order on site_sections (should already exist but ensure no NULLs) ──
DO $$ BEGIN
  UPDATE public.site_sections
  SET sort_order = 0
  WHERE sort_order IS NULL;
END $$;

DO $$ BEGIN
  RAISE NOTICE 'Migration 067: Website versioning tables ready.';
END $$;
