-- 054_website_image_plans_complete.sql
-- Comprehensive idempotent migration for the AI Website Image Builder.
-- Supersedes 030_website_ai_images.sql — safe to run even if 030 was already applied.
--
-- Creates / upgrades:
--   • public.website_image_plans   – one row per AI image slot (plan + generation result)
--   • public.website_image_jobs    – one row per Imagen API call attempt
--   • storage.buckets "website-assets"  (used by app code via WEBSITE_IMAGE_BUCKET)
--   • storage.buckets "website-images"  (alias bucket, also accepted)
--   • Full RLS policies (owner full-access, admin per-tenant, staff per-tenant read/write)
--   • updated_at triggers
--
-- Design rules:
--   • All DDL uses IF NOT EXISTS / IF EXISTS so the file is fully idempotent.
--   • Existing column names are preserved so code written against 030 keeps working.
--   • New columns (job_id, source_type, storage_bucket, provider, error_message,
--     generated_at, applied_at, sort_order, caption, provider_request,
--     provider_response, error_details) are added via ALTER TABLE ADD COLUMN IF NOT EXISTS.
--   • The status CHECK constraint is widened to include the union of all valid states.
--   • Existing data is never deleted.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. website_image_plans
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.website_image_plans (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- section / page targeting (kept as page_id/section_id to match existing code)
  page_id                uuid        NULL REFERENCES public.site_pages(id) ON DELETE SET NULL,
  section_id             uuid        NULL REFERENCES public.site_sections(id) ON DELETE SET NULL,
  plan_group_id          uuid        NULL,
  -- placement
  placement_key          text        NOT NULL,
  section_type           text        NULL,
  image_role             text        NOT NULL,
  -- descriptive metadata
  title                  text        NULL,
  reason                 text        NULL,
  business_goal          text        NULL,
  image_description      text        NULL,
  visual_style           text        NULL,
  -- generation inputs
  prompt                 text        NOT NULL DEFAULT '',
  negative_prompt        text        NULL,
  aspect_ratio           text        NULL DEFAULT '16:9',
  width                  integer     NULL,
  height                 integer     NULL,
  -- priority / config
  priority               integer     NOT NULL DEFAULT 100,
  use_existing_if_avail  boolean     NOT NULL DEFAULT true,
  selected_source        text        NOT NULL DEFAULT 'generate'
    CHECK (selected_source IN ('generate','existing','uploaded','manual','none')),
  existing_asset_url     text        NULL,
  -- generation output  (original column names kept for backward compatibility)
  generated_asset_url    text        NULL,   -- same semantic as public_url
  generated_storage_path text        NULL,   -- same semantic as storage_path
  generated_alt_text     text        NULL,   -- same semantic as alt_text
  -- status
  status                 text        NOT NULL DEFAULT 'planned'
    CHECK (status IN (
      'planned','queued','approved','generating','generated',
      'uploaded','applied','rejected','failed','disabled','skipped','archived'
    )),
  -- audit
  created_by             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Add new columns that did not exist in migration 030 (idempotent via DO block).
DO $$
BEGIN
  -- Provider / source tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='source_type') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN source_type text NOT NULL DEFAULT 'ai_builder'
        CHECK (source_type IN ('ai_builder','manual','import','regeneration'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='provider') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN provider text NOT NULL DEFAULT 'google-imagen'
        CHECK (provider IN ('google-imagen','gemini','manual'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='provider_request') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN provider_request jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='provider_response') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN provider_response jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  -- Storage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='storage_bucket') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN storage_bucket text NULL DEFAULT 'website-assets';
  END IF;

  -- Convenience aliases for public_url / storage_path / alt_text
  -- (These are duplicates of generated_asset_url etc., kept for readability in new queries)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='public_url') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN public_url text NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='storage_path') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN storage_path text NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='alt_text') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN alt_text text NULL;
  END IF;

  -- Error tracking on the plan itself (job has its own error_message)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='error_message') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN error_message text NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='error_details') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN error_details text NULL;
  END IF;

  -- Lifecycle timestamps
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='generated_at') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN generated_at timestamptz NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='applied_at') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN applied_at timestamptz NULL;
  END IF;

  -- Misc
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='caption') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN caption text NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='sort_order') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
  END IF;

  -- job_id: FK to website_image_jobs (added after that table exists — see below)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='job_id') THEN
    ALTER TABLE public.website_image_plans
      ADD COLUMN job_id uuid NULL;
  END IF;
END;
$$;

-- Widen the status CHECK constraint to include all valid values.
-- (Drop old narrower constraint if it still exists, then add the broad one.)
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.website_image_plans'::regclass
    AND contype = 'c'
    AND conname LIKE '%status%'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.website_image_plans DROP CONSTRAINT %I', con_name);
  END IF;
END;
$$;

ALTER TABLE public.website_image_plans
  ADD CONSTRAINT website_image_plans_status_check
  CHECK (status IN (
    'planned','queued','approved','generating','generated',
    'uploaded','applied','rejected','failed','disabled','skipped','archived'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. website_image_jobs
-- ─────────────────────────────────────────────────────────────────────────────

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

-- Now that website_image_jobs exists, we can safely add the FK from plans.job_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.website_image_plans'::regclass
      AND conname = 'website_image_plans_job_id_fkey'
  ) THEN
    ALTER TABLE public.website_image_plans
      ADD CONSTRAINT website_image_plans_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.website_image_jobs(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_wip_tenant_id        ON public.website_image_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wip_tenant_status     ON public.website_image_plans(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_wip_page_id           ON public.website_image_plans(page_id);
CREATE INDEX IF NOT EXISTS idx_wip_tenant_page_id    ON public.website_image_plans(tenant_id, page_id);
CREATE INDEX IF NOT EXISTS idx_wip_section_id        ON public.website_image_plans(section_id);
CREATE INDEX IF NOT EXISTS idx_wip_tenant_section_id ON public.website_image_plans(tenant_id, section_id);
CREATE INDEX IF NOT EXISTS idx_wip_group             ON public.website_image_plans(plan_group_id);
CREATE INDEX IF NOT EXISTS idx_wip_job_id            ON public.website_image_plans(job_id);
CREATE INDEX IF NOT EXISTS idx_wip_status            ON public.website_image_plans(status);
CREATE INDEX IF NOT EXISTS idx_wip_created_at        ON public.website_image_plans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wip_active            ON public.website_image_plans(status)
  WHERE status IN ('planned','queued','generating');

CREATE INDEX IF NOT EXISTS idx_wij_tenant_id   ON public.website_image_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wij_plan_id     ON public.website_image_jobs(plan_id);
CREATE INDEX IF NOT EXISTS idx_wij_status      ON public.website_image_jobs(status);
CREATE INDEX IF NOT EXISTS idx_wij_created_at  ON public.website_image_jobs(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.website_image_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_image_jobs  ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating so this migration is re-runnable.
DROP POLICY IF EXISTS "owner_all_image_plans"    ON public.website_image_plans;
DROP POLICY IF EXISTS "admin_tenant_image_plans"  ON public.website_image_plans;
DROP POLICY IF EXISTS "staff_tenant_image_plans"  ON public.website_image_plans;
DROP POLICY IF EXISTS "owner_all_image_jobs"      ON public.website_image_jobs;
DROP POLICY IF EXISTS "admin_tenant_image_jobs"   ON public.website_image_jobs;
DROP POLICY IF EXISTS "staff_tenant_image_jobs"   ON public.website_image_jobs;

-- Plans: owner has global access
CREATE POLICY "owner_all_image_plans" ON public.website_image_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'owner')
  );

-- Plans: admin access for their tenant
CREATE POLICY "admin_tenant_image_plans" ON public.website_image_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role = 'admin'
        AND tenant_id = website_image_plans.tenant_id
    )
  );

-- Plans: staff read/write for their tenant
CREATE POLICY "staff_tenant_image_plans" ON public.website_image_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role = 'staff'
        AND tenant_id = website_image_plans.tenant_id
    )
  );

-- Jobs: owner has global access
CREATE POLICY "owner_all_image_jobs" ON public.website_image_jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'owner')
  );

-- Jobs: admin per-tenant
CREATE POLICY "admin_tenant_image_jobs" ON public.website_image_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role = 'admin'
        AND tenant_id = website_image_jobs.tenant_id
    )
  );

-- Jobs: staff per-tenant
CREATE POLICY "staff_tenant_image_jobs" ON public.website_image_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role = 'staff'
        AND tenant_id = website_image_jobs.tenant_id
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Storage buckets
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary bucket used by the app code (WEBSITE_IMAGE_BUCKET = 'website-assets')
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'website-assets',
  'website-assets',
  true,
  10485760,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Alias bucket (website-images) — same settings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'website-images',
  'website-images',
  true,
  10485760,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Storage RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop and recreate so this file is idempotent.
DROP POLICY IF EXISTS "website_assets_public_read"           ON storage.objects;
DROP POLICY IF EXISTS "website_assets_authenticated_insert"  ON storage.objects;
DROP POLICY IF EXISTS "website_assets_authenticated_update"  ON storage.objects;
DROP POLICY IF EXISTS "website_assets_authenticated_delete"  ON storage.objects;
DROP POLICY IF EXISTS "website_images_public_read"           ON storage.objects;
DROP POLICY IF EXISTS "website_images_authenticated_insert"  ON storage.objects;
DROP POLICY IF EXISTS "website_images_authenticated_update"  ON storage.objects;
DROP POLICY IF EXISTS "website_images_authenticated_delete"  ON storage.objects;

-- website-assets: public read
CREATE POLICY "website_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'website-assets');

CREATE POLICY "website_assets_authenticated_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'website-assets' AND auth.role() = 'authenticated');

CREATE POLICY "website_assets_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'website-assets' AND auth.role() = 'authenticated');

CREATE POLICY "website_assets_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'website-assets' AND auth.role() = 'authenticated');

-- website-images: public read
CREATE POLICY "website_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'website-images');

CREATE POLICY "website_images_authenticated_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'website-images' AND auth.role() = 'authenticated');

CREATE POLICY "website_images_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'website-images' AND auth.role() = 'authenticated');

CREATE POLICY "website_images_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'website-images' AND auth.role() = 'authenticated');
