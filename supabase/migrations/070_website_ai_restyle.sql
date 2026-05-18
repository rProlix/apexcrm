-- ============================================================
-- 070_website_ai_restyle.sql
-- Adds support for the AI Restyle Website feature.
-- Creates website_ai_restyle_runs table and expands the
-- site_versions.source constraint to allow 'ai_restyle'
-- and 'before_ai_restyle' sources.
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. Expand site_versions source constraint ─────────────────────────────────
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
      'restore',
      'publish',
      'drag_drop',
      'section_edit',
      'auto',
      'system'
    )
  );

-- ── 2. Create website_ai_restyle_runs table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.website_ai_restyle_runs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status           text        NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'applied', 'failed', 'cancelled')),
  style_preset     text,
  custom_prompt    text,
  intensity        text
    CHECK (intensity IN ('subtle', 'balanced', 'cinematic')),
  preserve_content boolean     NOT NULL DEFAULT true,
  preserve_images  boolean     NOT NULL DEFAULT false,
  restyle_plan     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  applied_at       timestamptz,
  before_version_id uuid,
  after_version_id  uuid
);

-- ── 3. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS website_ai_restyle_runs_tenant_idx
  ON public.website_ai_restyle_runs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS website_ai_restyle_runs_status_idx
  ON public.website_ai_restyle_runs (tenant_id, status)
  WHERE status = 'applied';

-- ── 4. RLS policies ───────────────────────────────────────────────────────────
ALTER TABLE public.website_ai_restyle_runs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (idempotent)
DROP POLICY IF EXISTS "website_ai_restyle_runs_owner_select"  ON public.website_ai_restyle_runs;
DROP POLICY IF EXISTS "website_ai_restyle_runs_owner_insert"  ON public.website_ai_restyle_runs;
DROP POLICY IF EXISTS "website_ai_restyle_runs_owner_update"  ON public.website_ai_restyle_runs;
DROP POLICY IF EXISTS "website_ai_restyle_runs_service_all"   ON public.website_ai_restyle_runs;

-- Owners and admins can read their own tenant's restyle runs
CREATE POLICY "website_ai_restyle_runs_owner_select"
  ON public.website_ai_restyle_runs
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "website_ai_restyle_runs_owner_insert"
  ON public.website_ai_restyle_runs
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "website_ai_restyle_runs_owner_update"
  ON public.website_ai_restyle_runs
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Service role bypass (server-side mutations via API routes)
CREATE POLICY "website_ai_restyle_runs_service_all"
  ON public.website_ai_restyle_runs
  FOR ALL
  USING (auth.role() = 'service_role');
