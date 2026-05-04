-- 030_website_ai_images.sql
-- AI Website Image Builder tables:
--   website_image_plans  – planner output (what images are needed + why)
--   website_image_jobs   – individual generation job per image
-- The existing text-AI tables (website_ai_import_jobs, etc.) are untouched.

-- ─── website_image_plans ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.website_image_plans (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_id                uuid        NULL REFERENCES public.site_pages(id) ON DELETE SET NULL,
  section_id             uuid        NULL REFERENCES public.site_sections(id) ON DELETE SET NULL,
  plan_group_id          uuid        NULL,
  placement_key          text        NOT NULL,
  section_type           text        NULL,
  image_role             text        NOT NULL,
  title                  text        NULL,
  reason                 text        NULL,
  business_goal          text        NULL,
  image_description      text        NULL,
  visual_style           text        NULL,
  prompt                 text        NOT NULL DEFAULT '',
  negative_prompt        text        NULL,
  aspect_ratio           text        NULL DEFAULT '16:9',
  width                  integer     NULL,
  height                 integer     NULL,
  priority               integer     NOT NULL DEFAULT 100,
  use_existing_if_avail  boolean     NOT NULL DEFAULT true,
  selected_source        text        NOT NULL DEFAULT 'generate'
    CHECK (selected_source IN ('generate','existing','uploaded','manual','none')),
  existing_asset_url     text        NULL,
  generated_asset_url    text        NULL,
  generated_storage_path text        NULL,
  generated_alt_text     text        NULL,
  status                 text        NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','approved','generating','generated','rejected','disabled','applied')),
  created_by             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wip_tenant_id   ON public.website_image_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wip_page_id     ON public.website_image_plans(page_id);
CREATE INDEX IF NOT EXISTS idx_wip_section_id  ON public.website_image_plans(section_id);
CREATE INDEX IF NOT EXISTS idx_wip_status      ON public.website_image_plans(status);
CREATE INDEX IF NOT EXISTS idx_wip_group       ON public.website_image_plans(plan_group_id);
CREATE INDEX IF NOT EXISTS idx_wip_created_at  ON public.website_image_plans(created_at DESC);

-- ─── website_image_jobs ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.website_image_jobs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id              uuid        NULL REFERENCES public.website_image_plans(id) ON DELETE SET NULL,
  status               text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','generating','completed','failed','cancelled')),
  model                text        NOT NULL DEFAULT 'imagen-4.0-ultra-generate-001',
  prompt               text        NULL,
  negative_prompt      text        NULL,
  aspect_ratio         text        NULL,
  image_role           text        NULL,
  placement_key        text        NULL,
  storage_path         text        NULL,
  public_url           text        NULL,
  alt_text             text        NULL,
  generation_metadata  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error_message        text        NULL,
  created_by           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wij_tenant_id  ON public.website_image_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wij_plan_id    ON public.website_image_jobs(plan_id);
CREATE INDEX IF NOT EXISTS idx_wij_status     ON public.website_image_jobs(status);
CREATE INDEX IF NOT EXISTS idx_wij_created_at ON public.website_image_jobs(created_at DESC);

-- ─── updated_at triggers ──────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'website_image_plans_updated_at'
    ) THEN
      EXECUTE 'CREATE TRIGGER website_image_plans_updated_at
        BEFORE UPDATE ON public.website_image_plans
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'website_image_jobs_updated_at'
    ) THEN
      EXECUTE 'CREATE TRIGGER website_image_jobs_updated_at
        BEFORE UPDATE ON public.website_image_jobs
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
    END IF;
  END IF;
END;
$$;

-- ─── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.website_image_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_image_jobs  ENABLE ROW LEVEL SECURITY;

-- website_image_plans policies
CREATE POLICY "owner_all_image_plans" ON public.website_image_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "admin_tenant_image_plans" ON public.website_image_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role = 'admin'
        AND tenant_id = website_image_plans.tenant_id
    )
  );

-- website_image_jobs policies
CREATE POLICY "owner_all_image_jobs" ON public.website_image_jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "admin_tenant_image_jobs" ON public.website_image_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role = 'admin'
        AND tenant_id = website_image_jobs.tenant_id
    )
  );
