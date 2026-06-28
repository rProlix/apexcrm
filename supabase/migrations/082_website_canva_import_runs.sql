-- supabase/migrations/082_website_canva_import_runs.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Canva import undo / rollback.
--
-- Every time a Canva import is applied to a website draft we record a run that
-- captures the BEFORE-draft and BEFORE-published snapshots, so the user can
-- safely undo the import or restore the pre-import / last-published state.
--
-- Fully additive + idempotent. Reuses the existing site_versions snapshot shape.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.website_canva_import_runs (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id               uuid,
  website_id                uuid        NOT NULL,
  canva_import_id           uuid,
  run_type                  text        NOT NULL DEFAULT 'import',
  status                    text        NOT NULL DEFAULT 'started',
  before_draft_snapshot     jsonb,
  before_published_snapshot jsonb,
  after_draft_snapshot      jsonb,
  warnings                  jsonb       NOT NULL DEFAULT '[]',
  error_message             text,
  created_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  completed_at              timestamptz,
  CONSTRAINT website_canva_run_type_check CHECK (
    run_type IN ('preview','import','apply','undo','restore')
  ),
  CONSTRAINT website_canva_run_status_check CHECK (
    status IN ('started','completed','failed','undone')
  )
);

CREATE INDEX IF NOT EXISTS website_canva_runs_tenant_idx     ON public.website_canva_import_runs(tenant_id);
CREATE INDEX IF NOT EXISTS website_canva_runs_website_idx     ON public.website_canva_import_runs(website_id);
CREATE INDEX IF NOT EXISTS website_canva_runs_import_idx      ON public.website_canva_import_runs(canva_import_id);
CREATE INDEX IF NOT EXISTS website_canva_runs_status_idx      ON public.website_canva_import_runs(status);
CREATE INDEX IF NOT EXISTS website_canva_runs_created_at_idx  ON public.website_canva_import_runs(created_at);

-- ── RLS (service role + owner/admin), matches website_canva_imports ───────────
ALTER TABLE public.website_canva_import_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON public.website_canva_import_runs;
CREATE POLICY service_role_all ON public.website_canva_import_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS website_canva_runs_owner ON public.website_canva_import_runs;
CREATE POLICY website_canva_runs_owner ON public.website_canva_import_runs
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

DROP POLICY IF EXISTS website_canva_runs_admin ON public.website_canva_import_runs;
CREATE POLICY website_canva_runs_admin ON public.website_canva_import_runs
  FOR ALL TO authenticated
  USING  (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  WITH CHECK (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'));
