-- 028_website_ai_autofill.sql
-- AI Website Autofill feature: import jobs, suggestions, and applied changes

-- ── 1. website_ai_import_jobs ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.website_ai_import_jobs (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  source_type            text        NOT NULL DEFAULT 'mixed'
                                     CHECK (source_type IN (
                                       'mixed','pasted_text','reviews','services',
                                       'products','menu','business_profile',
                                       'contact_hours','faq','policies'
                                     )),
  raw_input              text        NOT NULL,
  status                 text        NOT NULL DEFAULT 'draft'
                                     CHECK (status IN (
                                       'draft','analyzing','ready','applied','failed','cancelled'
                                     )),
  model                  text        NOT NULL DEFAULT 'gemini-3.1-pro-preview',
  summary                text        NULL,
  detected_business_type text        NULL,
  detected_content_types text[]      NOT NULL DEFAULT '{}',
  confidence             numeric     NULL,
  error_message          text        NULL,
  token_usage            jsonb       NOT NULL DEFAULT '{}',
  metadata               jsonb       NOT NULL DEFAULT '{}',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_ai_import_jobs_tenant_id
  ON public.website_ai_import_jobs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_website_ai_import_jobs_created_by
  ON public.website_ai_import_jobs (created_by);

CREATE INDEX IF NOT EXISTS idx_website_ai_import_jobs_status
  ON public.website_ai_import_jobs (status);

CREATE INDEX IF NOT EXISTS idx_website_ai_import_jobs_created_at
  ON public.website_ai_import_jobs (created_at DESC);

-- ── 2. website_ai_suggestions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.website_ai_suggestions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id           uuid        NOT NULL REFERENCES public.website_ai_import_jobs(id) ON DELETE CASCADE,
  suggestion_type  text        NOT NULL,
  action           text        NOT NULL DEFAULT 'create'
                               CHECK (action IN ('create','update','append','replace','ignore')),
  target_page_id   uuid        NULL,
  target_section_id uuid       NULL,
  title            text        NULL,
  description      text        NULL,
  reason           text        NULL,
  extracted_data   jsonb       NOT NULL DEFAULT '{}',
  proposed_section jsonb       NOT NULL DEFAULT '{}',
  confidence       numeric     NOT NULL DEFAULT 0,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','accepted','rejected','edited','applied')),
  admin_notes      text        NULL,
  applied_at       timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_ai_suggestions_tenant_id
  ON public.website_ai_suggestions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_website_ai_suggestions_job_id
  ON public.website_ai_suggestions (job_id);

CREATE INDEX IF NOT EXISTS idx_website_ai_suggestions_type
  ON public.website_ai_suggestions (suggestion_type);

CREATE INDEX IF NOT EXISTS idx_website_ai_suggestions_status
  ON public.website_ai_suggestions (status);

CREATE INDEX IF NOT EXISTS idx_website_ai_suggestions_created_at
  ON public.website_ai_suggestions (created_at DESC);

-- ── 3. website_ai_applied_changes ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.website_ai_applied_changes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id          uuid        NOT NULL REFERENCES public.website_ai_import_jobs(id) ON DELETE CASCADE,
  suggestion_id   uuid        NULL REFERENCES public.website_ai_suggestions(id) ON DELETE SET NULL,
  applied_by      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type     text        NOT NULL
                              CHECK (target_type IN (
                                'website_page','website_section','website_settings',
                                'store_product','navigation_item','review','unknown'
                              )),
  target_id       uuid        NULL,
  before_snapshot jsonb       NULL,
  after_snapshot  jsonb       NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_ai_applied_changes_tenant_id
  ON public.website_ai_applied_changes (tenant_id);

CREATE INDEX IF NOT EXISTS idx_website_ai_applied_changes_job_id
  ON public.website_ai_applied_changes (job_id);

CREATE INDEX IF NOT EXISTS idx_website_ai_applied_changes_suggestion_id
  ON public.website_ai_applied_changes (suggestion_id);

CREATE INDEX IF NOT EXISTS idx_website_ai_applied_changes_target_type
  ON public.website_ai_applied_changes (target_type);

CREATE INDEX IF NOT EXISTS idx_website_ai_applied_changes_created_at
  ON public.website_ai_applied_changes (created_at DESC);

-- ── updated_at triggers ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_website_ai_import_jobs_updated_at
  ON public.website_ai_import_jobs;
CREATE TRIGGER trg_website_ai_import_jobs_updated_at
  BEFORE UPDATE ON public.website_ai_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_website_ai_suggestions_updated_at
  ON public.website_ai_suggestions;
CREATE TRIGGER trg_website_ai_suggestions_updated_at
  BEFORE UPDATE ON public.website_ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.website_ai_import_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_ai_suggestions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_ai_applied_changes ENABLE ROW LEVEL SECURITY;

-- Jobs: owner = all; admin = own tenant only; others = nothing
DO $$
BEGIN
  -- owner
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'website_ai_import_jobs' AND policyname = 'ai_jobs_owner_all'
  ) THEN
    CREATE POLICY ai_jobs_owner_all
      ON public.website_ai_import_jobs
      FOR ALL
      TO authenticated
      USING (
        (auth.jwt() ->> 'role') = 'owner'
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
      )
      WITH CHECK (
        (auth.jwt() ->> 'role') = 'owner'
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
      );
  END IF;

  -- admin: own tenant
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'website_ai_import_jobs' AND policyname = 'ai_jobs_admin_tenant'
  ) THEN
    CREATE POLICY ai_jobs_admin_tenant
      ON public.website_ai_import_jobs
      FOR ALL
      TO authenticated
      USING (
        tenant_id::text = (auth.jwt() ->> 'tenant_id')
        AND (
          (auth.jwt() ->> 'role') = 'admin'
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
      )
      WITH CHECK (
        tenant_id::text = (auth.jwt() ->> 'tenant_id')
        AND (
          (auth.jwt() ->> 'role') = 'admin'
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'website_ai_suggestions' AND policyname = 'ai_suggestions_owner_all'
  ) THEN
    CREATE POLICY ai_suggestions_owner_all
      ON public.website_ai_suggestions
      FOR ALL
      TO authenticated
      USING (
        (auth.jwt() ->> 'role') = 'owner'
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
      )
      WITH CHECK (
        (auth.jwt() ->> 'role') = 'owner'
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'website_ai_suggestions' AND policyname = 'ai_suggestions_admin_tenant'
  ) THEN
    CREATE POLICY ai_suggestions_admin_tenant
      ON public.website_ai_suggestions
      FOR ALL
      TO authenticated
      USING (
        tenant_id::text = (auth.jwt() ->> 'tenant_id')
        AND (
          (auth.jwt() ->> 'role') = 'admin'
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
      )
      WITH CHECK (
        tenant_id::text = (auth.jwt() ->> 'tenant_id')
        AND (
          (auth.jwt() ->> 'role') = 'admin'
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'website_ai_applied_changes' AND policyname = 'ai_applied_owner_all'
  ) THEN
    CREATE POLICY ai_applied_owner_all
      ON public.website_ai_applied_changes
      FOR ALL
      TO authenticated
      USING (
        (auth.jwt() ->> 'role') = 'owner'
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
      )
      WITH CHECK (
        (auth.jwt() ->> 'role') = 'owner'
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'website_ai_applied_changes' AND policyname = 'ai_applied_admin_tenant'
  ) THEN
    CREATE POLICY ai_applied_admin_tenant
      ON public.website_ai_applied_changes
      FOR ALL
      TO authenticated
      USING (
        tenant_id::text = (auth.jwt() ->> 'tenant_id')
        AND (
          (auth.jwt() ->> 'role') = 'admin'
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
      )
      WITH CHECK (
        tenant_id::text = (auth.jwt() ->> 'tenant_id')
        AND (
          (auth.jwt() ->> 'role') = 'admin'
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
      );
  END IF;
END;
$$;
