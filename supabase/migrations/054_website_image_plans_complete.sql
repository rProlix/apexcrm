-- =============================================================================
-- 054_website_image_plans_complete.sql
-- =============================================================================
-- COMPREHENSIVE idempotent migration for the Website Builder AI Image system.
-- Supersedes: 030_website_ai_images.sql, 055_fix_website_image_plans_created_by.sql,
--             056_website_image_context.sql, 057_website_generated_images.sql
--
-- Creates / repairs:
--   1. public.website_image_plans        — one row per AI image plan/slot
--   2. public.website_image_jobs         — one row per Imagen API call attempt
--   3. public.website_generated_images   — gallery of every generated image per section
--   4. updated_at trigger function
--   5. Triggers on all three tables
--   6. Indexes
--   7. Storage buckets: website-assets, website-images
--   8. RLS policies
--
-- SAFE TO RUN MULTIPLE TIMES — every statement uses IF NOT EXISTS / DO blocks.
-- =============================================================================

-- =============================================================================
-- HELPER: set_updated_at function (also known as update_updated_at_column)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Also expose under the legacy name so older triggers still work.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 1. website_image_plans
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.website_image_plans (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_id                uuid        NULL,   -- FK added defensively below
  section_id             uuid        NULL,   -- FK added defensively below
  plan_group_id          uuid        NULL,
  -- placement
  placement_key          text        NOT NULL DEFAULT '',
  section_type           text        NULL,
  image_role             text        NOT NULL DEFAULT 'primary',
  -- descriptive metadata
  title                  text        NULL,
  reason                 text        NULL,
  business_goal          text        NULL,
  image_description      text        NULL,
  visual_style           text        NULL,
  -- AI context (added in 056)
  business_name          text        NULL,
  business_category      text        NULL,
  business_summary       text        NULL,
  image_goal             text        NULL,
  subject_text           text        NULL,
  reasoning              text        NULL,
  source_context         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- generation inputs
  prompt                 text        NOT NULL DEFAULT '',
  negative_prompt        text        NULL,
  aspect_ratio           text        NOT NULL DEFAULT '16:9',
  requested_aspect_ratio text        NULL,   -- original ratio before normalization
  width                  integer     NULL,
  height                 integer     NULL,
  -- priority / config
  priority               integer     NOT NULL DEFAULT 100,
  use_existing_if_avail  boolean     NOT NULL DEFAULT true,
  selected_source        text        NOT NULL DEFAULT 'generate'
    CHECK (selected_source IN ('generate','existing','uploaded','manual','none')),
  existing_asset_url     text        NULL,
  -- generation output (original column names kept for backward compatibility)
  generated_asset_url    text        NULL,
  generated_storage_path text        NULL,
  generated_alt_text     text        NULL,
  -- convenience aliases
  public_url             text        NULL,
  storage_path           text        NULL,
  alt_text               text        NULL,
  storage_bucket         text        NULL    DEFAULT 'website-assets',
  -- job linkage
  job_id                 uuid        NULL,   -- FK added after website_image_jobs
  -- status
  status                 text        NOT NULL DEFAULT 'planned',
  -- provider
  source_type            text        NOT NULL DEFAULT 'ai_builder',
  provider               text        NOT NULL DEFAULT 'google-imagen',
  -- error tracking
  error_message          text        NULL,
  error_details          text        NULL,
  -- lifecycle timestamps
  generated_at           timestamptz NULL,
  applied_at             timestamptz NULL,
  -- misc
  caption                text        NULL,
  sort_order             integer     NOT NULL DEFAULT 0,
  -- audit
  created_by             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ── Status CHECK (drop old, add broad) ────────────────────────────────────────
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.website_image_plans'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%'
  LIMIT 1;
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.website_image_plans DROP CONSTRAINT %I', v_conname);
  END IF;
END;
$$;

ALTER TABLE public.website_image_plans
  ADD CONSTRAINT website_image_plans_status_check
  CHECK (status IN (
    'draft','planned','queued','approved','generating','generated',
    'uploaded','applied','rejected','failed','disabled','skipped','archived'
  ));

-- ── Aspect ratio CHECK ────────────────────────────────────────────────────────
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.website_image_plans'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) LIKE '%aspect_ratio%'
    AND conname  != 'website_image_plans_status_check'
  LIMIT 1;
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.website_image_plans DROP CONSTRAINT %I', v_conname);
  END IF;
END;
$$;

ALTER TABLE public.website_image_plans
  ADD CONSTRAINT website_image_plans_aspect_ratio_check
  CHECK (aspect_ratio IN ('1:1','9:16','16:9','4:3','3:4'));

-- ── Normalize any bad aspect_ratio values already in the DB ───────────────────
DO $$
BEGIN
  UPDATE public.website_image_plans
  SET requested_aspect_ratio = COALESCE(requested_aspect_ratio, aspect_ratio),
      aspect_ratio = CASE aspect_ratio
        WHEN '3:2'   THEN '4:3'
        WHEN '2:3'   THEN '3:4'
        WHEN '4:5'   THEN '3:4'
        WHEN '5:4'   THEN '4:3'
        WHEN '21:9'  THEN '16:9'
        WHEN '16:10' THEN '16:9'
        WHEN '10:16' THEN '9:16'
        WHEN '2:1'   THEN '16:9'
        WHEN '1:2'   THEN '9:16'
        ELSE '16:9'
      END
  WHERE aspect_ratio NOT IN ('1:1','9:16','16:9','4:3','3:4')
     OR aspect_ratio IS NULL;
  RAISE NOTICE 'Normalized aspect_ratio values in website_image_plans.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped aspect_ratio normalization: %', SQLERRM;
END;
$$;

-- ── Add columns that might be missing (idempotent) ────────────────────────────
DO $$
DECLARE cols text[] := ARRAY[
  'business_name','business_category','business_summary',
  'image_goal','subject_text','reasoning',
  'requested_aspect_ratio'
];
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='website_image_plans' AND column_name=col
    ) THEN
      EXECUTE format('ALTER TABLE public.website_image_plans ADD COLUMN %I text NULL', col);
      RAISE NOTICE 'Added column website_image_plans.%', col;
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='source_context'
  ) THEN
    ALTER TABLE public.website_image_plans ADD COLUMN source_context jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END;
$$;

-- ── Defensive FK to site_pages ─────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='site_pages'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.website_image_plans'::regclass AND conname='website_image_plans_page_id_fkey'
  ) THEN
    ALTER TABLE public.website_image_plans
      ADD CONSTRAINT website_image_plans_page_id_fkey
      FOREIGN KEY (page_id) REFERENCES public.site_pages(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped page_id FK: %', SQLERRM;
END;
$$;

-- ── Defensive FK to site_sections ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='site_sections'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.website_image_plans'::regclass AND conname='website_image_plans_section_id_fkey'
  ) THEN
    ALTER TABLE public.website_image_plans
      ADD CONSTRAINT website_image_plans_section_id_fkey
      FOREIGN KEY (section_id) REFERENCES public.site_sections(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped section_id FK: %', SQLERRM;
END;
$$;

-- =============================================================================
-- 2. website_image_jobs
-- =============================================================================
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
  business_type        text        NULL,
  generation_metadata  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error_message        text        NULL,
  created_by           uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Add business_type column if missing (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='website_image_jobs' AND column_name='business_type'
  ) THEN
    ALTER TABLE public.website_image_jobs ADD COLUMN business_type text NULL;
  END IF;
END;
$$;

-- ── Now safe to add job_id FK on website_image_plans ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.website_image_plans'::regclass AND conname='website_image_plans_job_id_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='job_id'
    ) THEN
      ALTER TABLE public.website_image_plans ADD COLUMN job_id uuid NULL;
    END IF;
    ALTER TABLE public.website_image_plans
      ADD CONSTRAINT website_image_plans_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.website_image_jobs(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped job_id FK: %', SQLERRM;
END;
$$;

-- =============================================================================
-- 3. website_generated_images  (the per-section image gallery)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.website_generated_images (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  website_id             uuid        NULL,
  page_id                uuid        NULL,
  section_id             uuid        NOT NULL,  -- FK added defensively below
  image_plan_id          uuid        NULL REFERENCES public.website_image_plans(id) ON DELETE SET NULL,
  image_slot             text        NOT NULL DEFAULT 'primary',
  image_role             text        NULL,
  section_type           text        NULL,
  prompt                 text        NOT NULL DEFAULT '',
  model                  text        NOT NULL DEFAULT 'imagen-4.0-ultra-generate-001',
  requested_aspect_ratio text        NULL,
  aspect_ratio           text        NOT NULL DEFAULT '16:9',
  bucket                 text        NOT NULL DEFAULT 'website-assets',
  storage_path           text        NOT NULL DEFAULT '',
  public_url             text        NOT NULL DEFAULT '',
  alt_text               text        NULL,
  is_active              boolean     NOT NULL DEFAULT false,
  is_archived            boolean     NOT NULL DEFAULT false,
  generation_status      text        NOT NULL DEFAULT 'ready',
  generation_error       text        NULL,
  metadata               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ── aspect_ratio CHECK ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.website_generated_images'::regclass
      AND conname='website_generated_images_aspect_ratio_check'
  ) THEN
    ALTER TABLE public.website_generated_images
      ADD CONSTRAINT website_generated_images_aspect_ratio_check
      CHECK (aspect_ratio IN ('1:1','9:16','16:9','4:3','3:4'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped aspect_ratio check on website_generated_images: %', SQLERRM;
END;
$$;

-- ── generation_status CHECK ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.website_generated_images'::regclass
      AND conname='website_generated_images_status_check'
  ) THEN
    ALTER TABLE public.website_generated_images
      ADD CONSTRAINT website_generated_images_status_check
      CHECK (generation_status IN ('ready','failed','archived'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped status check on website_generated_images: %', SQLERRM;
END;
$$;

-- ── Defensive FK to site_sections ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='site_sections'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.website_generated_images'::regclass
      AND conname='website_generated_images_section_id_fkey'
  ) THEN
    ALTER TABLE public.website_generated_images
      ADD CONSTRAINT website_generated_images_section_id_fkey
      FOREIGN KEY (section_id) REFERENCES public.site_sections(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped section_id FK on website_generated_images: %', SQLERRM;
END;
$$;

-- ── One active image per tenant+section+slot ──────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS website_generated_images_one_active_per_slot
  ON public.website_generated_images(tenant_id, section_id, image_slot)
  WHERE is_active = true AND is_archived = false;

-- =============================================================================
-- 4. Indexes
-- =============================================================================

-- website_image_plans
CREATE INDEX IF NOT EXISTS idx_wip_tenant_id         ON public.website_image_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wip_tenant_status      ON public.website_image_plans(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_wip_page_id            ON public.website_image_plans(page_id)    WHERE page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wip_tenant_page_id     ON public.website_image_plans(tenant_id, page_id);
CREATE INDEX IF NOT EXISTS idx_wip_section_id         ON public.website_image_plans(section_id) WHERE section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wip_tenant_section_id  ON public.website_image_plans(tenant_id, section_id);
CREATE INDEX IF NOT EXISTS idx_wip_group              ON public.website_image_plans(plan_group_id) WHERE plan_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wip_job_id             ON public.website_image_plans(job_id)     WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wip_status             ON public.website_image_plans(status);
CREATE INDEX IF NOT EXISTS idx_wip_created_at         ON public.website_image_plans(created_at DESC);

-- website_image_jobs
CREATE INDEX IF NOT EXISTS idx_wij_tenant_id    ON public.website_image_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wij_plan_id      ON public.website_image_jobs(plan_id)    WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wij_status       ON public.website_image_jobs(status);
CREATE INDEX IF NOT EXISTS idx_wij_created_at   ON public.website_image_jobs(created_at DESC);

-- website_generated_images
CREATE INDEX IF NOT EXISTS idx_wgi_tenant_id          ON public.website_generated_images(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wgi_section_id         ON public.website_generated_images(section_id);
CREATE INDEX IF NOT EXISTS idx_wgi_page_id            ON public.website_generated_images(page_id)         WHERE page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wgi_plan_id            ON public.website_generated_images(image_plan_id)   WHERE image_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wgi_tenant_section      ON public.website_generated_images(tenant_id, section_id);
CREATE INDEX IF NOT EXISTS idx_wgi_tenant_section_slot ON public.website_generated_images(tenant_id, section_id, image_slot);
CREATE INDEX IF NOT EXISTS idx_wgi_active             ON public.website_generated_images(tenant_id, section_id) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_wgi_created_at         ON public.website_generated_images(created_at DESC);

-- =============================================================================
-- 5. updated_at triggers
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='website_image_plans_updated_at'
      AND tgrelid='public.website_image_plans'::regclass
  ) THEN
    CREATE TRIGGER website_image_plans_updated_at
      BEFORE UPDATE ON public.website_image_plans
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='website_image_jobs_updated_at'
      AND tgrelid='public.website_image_jobs'::regclass
  ) THEN
    CREATE TRIGGER website_image_jobs_updated_at
      BEFORE UPDATE ON public.website_image_jobs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='website_generated_images_updated_at'
      AND tgrelid='public.website_generated_images'::regclass
  ) THEN
    CREATE TRIGGER website_generated_images_updated_at
      BEFORE UPDATE ON public.website_generated_images
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- =============================================================================
-- 6. activate_website_section_image function
-- =============================================================================
-- Atomically activates one generated image for a section slot.
-- Called from the activate API route as a fallback for complex cases.

CREATE OR REPLACE FUNCTION public.activate_website_section_image(
  p_section_id uuid,
  p_image_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_image     record;
  v_image_url text;
BEGIN
  -- Fetch the target image
  SELECT * INTO v_image
  FROM public.website_generated_images
  WHERE id = p_image_id AND section_id = p_section_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Image % not found for section %', p_image_id, p_section_id;
  END IF;

  IF v_image.is_archived THEN
    RAISE EXCEPTION 'Cannot activate archived image %. Restore it first.', p_image_id;
  END IF;

  v_image_url := v_image.public_url;

  -- Deactivate all other images for same slot
  UPDATE public.website_generated_images
  SET is_active  = false,
      updated_at = now()
  WHERE tenant_id  = v_image.tenant_id
    AND section_id = p_section_id
    AND image_slot = v_image.image_slot
    AND id        != p_image_id;

  -- Activate this image
  UPDATE public.website_generated_images
  SET is_active  = true,
      is_archived = false,
      updated_at  = now()
  WHERE id = p_image_id;

  -- Update related plan if any
  IF v_image.image_plan_id IS NOT NULL THEN
    UPDATE public.website_image_plans
    SET status     = 'applied',
        applied_at = now(),
        updated_at = now()
    WHERE id = v_image.image_plan_id;
  END IF;

  -- Patch the live site_section content (defensive — columns may vary)
  IF v_image_url IS NOT NULL AND v_image_url != '' THEN
    -- Try content column (jsonb)
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='site_sections'
          AND column_name='content' AND data_type='jsonb'
      ) THEN
        UPDATE public.site_sections
        SET content    = jsonb_set(coalesce(content, '{}'::jsonb), '{imageUrl}', to_jsonb(v_image_url), true),
            updated_at = now()
        WHERE id = p_section_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not update site_sections.content: %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success',    true,
    'section_id', p_section_id,
    'image_id',   p_image_id,
    'image_url',  v_image_url,
    'image_slot', v_image.image_slot
  );
END;
$$;

-- =============================================================================
-- 7. RLS
-- =============================================================================

ALTER TABLE public.website_image_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_image_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_generated_images ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies so this migration is fully re-runnable.
DROP POLICY IF EXISTS "owner_all_image_plans"          ON public.website_image_plans;
DROP POLICY IF EXISTS "admin_tenant_image_plans"       ON public.website_image_plans;
DROP POLICY IF EXISTS "staff_tenant_image_plans"       ON public.website_image_plans;
DROP POLICY IF EXISTS "owner_all_image_jobs"           ON public.website_image_jobs;
DROP POLICY IF EXISTS "admin_tenant_image_jobs"        ON public.website_image_jobs;
DROP POLICY IF EXISTS "staff_tenant_image_jobs"        ON public.website_image_jobs;
DROP POLICY IF EXISTS "wgi_select"                     ON public.website_generated_images;
DROP POLICY IF EXISTS "wgi_insert"                     ON public.website_generated_images;
DROP POLICY IF EXISTS "wgi_update"                     ON public.website_generated_images;
DROP POLICY IF EXISTS "wgi_delete"                     ON public.website_generated_images;
DROP POLICY IF EXISTS "wgi_public_read"                ON public.website_generated_images;

-- website_image_plans: owner (global)
CREATE POLICY "owner_all_image_plans" ON public.website_image_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'owner')
  );

-- website_image_plans: admin + staff (per-tenant)
CREATE POLICY "admin_tenant_image_plans" ON public.website_image_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin','staff','business')
        AND tenant_id = website_image_plans.tenant_id
    )
  );

-- website_image_jobs: owner (global)
CREATE POLICY "owner_all_image_jobs" ON public.website_image_jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'owner')
  );

-- website_image_jobs: admin + staff (per-tenant)
CREATE POLICY "admin_tenant_image_jobs" ON public.website_image_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin','staff','business')
        AND tenant_id = website_image_jobs.tenant_id
    )
  );

-- website_generated_images: public read (live business websites need images without auth)
CREATE POLICY "wgi_public_read" ON public.website_generated_images
  FOR SELECT
  USING (is_archived = false);

-- website_generated_images: authenticated per-tenant (all operations)
CREATE POLICY "wgi_select" ON public.website_generated_images
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "wgi_insert" ON public.website_generated_images
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner','admin','staff','business')
    )
  );

CREATE POLICY "wgi_update" ON public.website_generated_images
  FOR UPDATE TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner','admin','staff','business')
    )
  );

CREATE POLICY "wgi_delete" ON public.website_generated_images
  FOR DELETE TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('owner','admin')
    )
  );

-- =============================================================================
-- 8. Storage buckets
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'website-assets', 'website-assets', true, 10485760,
      ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/svg+xml']
    )
    ON CONFLICT (id) DO UPDATE SET public = true;

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'website-images', 'website-images', true, 10485760,
      ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/svg+xml']
    )
    ON CONFLICT (id) DO UPDATE SET public = true;

    -- Storage object policies (idempotent)
    DROP POLICY IF EXISTS "website_assets_public_read"          ON storage.objects;
    DROP POLICY IF EXISTS "website_assets_authenticated_insert" ON storage.objects;
    DROP POLICY IF EXISTS "website_assets_authenticated_update" ON storage.objects;
    DROP POLICY IF EXISTS "website_assets_authenticated_delete" ON storage.objects;
    DROP POLICY IF EXISTS "website_images_public_read"          ON storage.objects;
    DROP POLICY IF EXISTS "website_images_authenticated_insert" ON storage.objects;
    DROP POLICY IF EXISTS "website_images_authenticated_update" ON storage.objects;
    DROP POLICY IF EXISTS "website_images_authenticated_delete" ON storage.objects;

    CREATE POLICY "website_assets_public_read"
      ON storage.objects FOR SELECT USING (bucket_id = 'website-assets');
    CREATE POLICY "website_assets_authenticated_insert"
      ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'website-assets' AND auth.role() = 'authenticated');
    CREATE POLICY "website_assets_authenticated_update"
      ON storage.objects FOR UPDATE USING (bucket_id = 'website-assets' AND auth.role() = 'authenticated');
    CREATE POLICY "website_assets_authenticated_delete"
      ON storage.objects FOR DELETE USING (bucket_id = 'website-assets' AND auth.role() = 'authenticated');

    CREATE POLICY "website_images_public_read"
      ON storage.objects FOR SELECT USING (bucket_id = 'website-images');
    CREATE POLICY "website_images_authenticated_insert"
      ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'website-images' AND auth.role() = 'authenticated');
    CREATE POLICY "website_images_authenticated_update"
      ON storage.objects FOR UPDATE USING (bucket_id = 'website-images' AND auth.role() = 'authenticated');
    CREATE POLICY "website_images_authenticated_delete"
      ON storage.objects FOR DELETE USING (bucket_id = 'website-images' AND auth.role() = 'authenticated');

    RAISE NOTICE 'Storage buckets and policies created/updated.';
  ELSE
    RAISE NOTICE 'storage schema not found — skipping bucket setup.';
  END IF;
END;
$$;

-- =============================================================================
-- DONE
-- =============================================================================
-- Tables created:
--   public.website_image_plans
--   public.website_image_jobs
--   public.website_generated_images
-- Function created:
--   public.activate_website_section_image(p_section_id, p_image_id)
-- Buckets ensured:
--   website-assets, website-images
-- =============================================================================
