-- =============================================================================
-- 054_website_image_plans_complete.sql
-- =============================================================================
-- COMPREHENSIVE idempotent migration for the Website Builder AI Image system.
-- Safe to run on a brand-new database or over an existing one.
-- Supersedes: 030, 055, 056, 057 — run only this file to get everything.
--
-- Tables created:
--   1. public.website_image_plans        — one plan per section image slot
--   2. public.website_image_jobs         — one row per Imagen API call
--   3. public.website_section_images     — gallery of every generated image
--
-- Also creates:
--   • public.set_updated_at()            — trigger helper function
--   • public.update_updated_at_column()  — legacy alias of the above
--   • public.activate_website_section_image() — atomic activate function
--   • Storage buckets: website-assets, website-images
--   • RLS policies on all three tables
--   • Indexes
--
-- COMPATIBILITY: A view named website_generated_images is created over
-- website_section_images so any cached queries from migration 057 still work.
-- =============================================================================

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =============================================================================
-- 1. website_image_plans
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.website_image_plans (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_id                uuid        NULL,
  section_id             uuid        NULL,
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
  -- AI context
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
  requested_aspect_ratio text        NULL,
  width                  integer     NULL,
  height                 integer     NULL,
  -- priority / config
  priority               integer     NOT NULL DEFAULT 100,
  use_existing_if_avail  boolean     NOT NULL DEFAULT true,
  selected_source        text        NOT NULL DEFAULT 'generate',
  existing_asset_url     text        NULL,
  -- generation output (backward-compat aliases)
  generated_asset_url    text        NULL,
  generated_storage_path text        NULL,
  generated_alt_text     text        NULL,
  public_url             text        NULL,
  storage_path           text        NULL,
  alt_text               text        NULL,
  storage_bucket         text        NULL DEFAULT 'website-assets',
  job_id                 uuid        NULL,
  -- status
  status                 text        NOT NULL DEFAULT 'planned',
  source_type            text        NOT NULL DEFAULT 'ai_builder',
  provider               text        NOT NULL DEFAULT 'google-imagen',
  -- error tracking
  error_message          text        NULL,
  error_details          text        NULL,
  -- lifecycle
  generated_at           timestamptz NULL,
  applied_at             timestamptz NULL,
  caption                text        NULL,
  sort_order             integer     NOT NULL DEFAULT 0,
  -- audit
  created_by             uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ── Status CHECK ──────────────────────────────────────────────────────────────
DO $$
DECLARE v text;
BEGIN
  SELECT conname INTO v FROM pg_constraint
  WHERE conrelid='public.website_image_plans'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%status%' LIMIT 1;
  IF v IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.website_image_plans DROP CONSTRAINT %I', v);
  END IF;
END;$$;
ALTER TABLE public.website_image_plans
  ADD CONSTRAINT website_image_plans_status_check
  CHECK (status IN ('draft','planned','queued','approved','generating','generated',
                    'uploaded','applied','rejected','failed','disabled','skipped','archived'));

-- ── Aspect ratio CHECK ────────────────────────────────────────────────────────
DO $$
DECLARE v text;
BEGIN
  SELECT conname INTO v FROM pg_constraint
  WHERE conrelid='public.website_image_plans'::regclass AND contype='c'
    AND conname='website_image_plans_aspect_ratio_check';
  IF v IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.website_image_plans DROP CONSTRAINT %I', v);
  END IF;
END;$$;
ALTER TABLE public.website_image_plans
  ADD CONSTRAINT website_image_plans_aspect_ratio_check
  CHECK (aspect_ratio IN ('1:1','9:16','16:9','4:3','3:4'));

-- ── Normalize existing bad aspect_ratio rows ──────────────────────────────────
DO $$
BEGIN
  UPDATE public.website_image_plans
  SET requested_aspect_ratio = COALESCE(requested_aspect_ratio, aspect_ratio),
      aspect_ratio = CASE
        WHEN aspect_ratio IN ('1:1','9:16','16:9','4:3','3:4') THEN aspect_ratio
        WHEN aspect_ratio = '3:2'   THEN '4:3'
        WHEN aspect_ratio = '2:3'   THEN '3:4'
        WHEN aspect_ratio = '4:5'   THEN '3:4'
        WHEN aspect_ratio = '5:4'   THEN '4:3'
        WHEN aspect_ratio = '21:9'  THEN '16:9'
        WHEN aspect_ratio = '16:10' THEN '16:9'
        WHEN aspect_ratio = '10:16' THEN '9:16'
        ELSE '16:9'
      END
  WHERE aspect_ratio NOT IN ('1:1','9:16','16:9','4:3','3:4') OR aspect_ratio IS NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'aspect_ratio normalization skipped: %', SQLERRM;
END;$$;

-- ── Defensive FK: page_id → site_pages ───────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='site_pages')
  AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.website_image_plans'::regclass AND conname='website_image_plans_page_id_fkey') THEN
    ALTER TABLE public.website_image_plans ADD CONSTRAINT website_image_plans_page_id_fkey
      FOREIGN KEY (page_id) REFERENCES public.site_pages(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skip page FK: %', SQLERRM;
END;$$;

-- ── Defensive FK: section_id → site_sections ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='site_sections')
  AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.website_image_plans'::regclass AND conname='website_image_plans_section_id_fkey') THEN
    ALTER TABLE public.website_image_plans ADD CONSTRAINT website_image_plans_section_id_fkey
      FOREIGN KEY (section_id) REFERENCES public.site_sections(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skip section FK: %', SQLERRM;
END;$$;

-- ── Add any missing columns (idempotent) ──────────────────────────────────────
DO $$
DECLARE c text;
DECLARE cols text[] := ARRAY['business_name','business_category','business_summary',
  'image_goal','subject_text','reasoning','requested_aspect_ratio'];
BEGIN
  FOREACH c IN ARRAY cols LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='website_image_plans' AND column_name=c)
    THEN EXECUTE format('ALTER TABLE public.website_image_plans ADD COLUMN %I text NULL', c); END IF;
  END LOOP;
END;$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_plans' AND column_name='source_context')
  THEN ALTER TABLE public.website_image_plans ADD COLUMN source_context jsonb NOT NULL DEFAULT '{}'::jsonb; END IF;
END;$$;

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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='website_image_jobs' AND column_name='business_type')
  THEN ALTER TABLE public.website_image_jobs ADD COLUMN business_type text NULL; END IF;
END;$$;

-- ── job_id FK on plans ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.website_image_plans'::regclass
                 AND conname='website_image_plans_job_id_fkey') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
                   AND table_name='website_image_plans' AND column_name='job_id')
    THEN ALTER TABLE public.website_image_plans ADD COLUMN job_id uuid NULL; END IF;
    ALTER TABLE public.website_image_plans ADD CONSTRAINT website_image_plans_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.website_image_jobs(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skip job FK: %', SQLERRM;
END;$$;

-- =============================================================================
-- 3. website_section_images  (canonical gallery table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.website_section_images (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_id          uuid        NULL,
  section_id       uuid        NOT NULL,
  plan_id          uuid        NULL REFERENCES public.website_image_plans(id) ON DELETE SET NULL,
  created_by       uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  -- status
  status           text        NOT NULL DEFAULT 'generated',
  -- provider info
  provider         text        NOT NULL DEFAULT 'google-imagen',
  image_model      text        NOT NULL DEFAULT 'imagen-4.0-ultra-generate-001',
  -- storage
  storage_bucket   text        NOT NULL DEFAULT 'website-assets',
  storage_path     text        NULL,
  -- urls
  image_url        text        NOT NULL DEFAULT '',
  public_url       text        NULL,
  -- content
  prompt           text        NULL,
  revised_prompt   text        NULL,
  alt_text         text        NULL,
  caption          text        NULL,
  -- placement
  section_type     text        NULL,
  slot_key         text        NOT NULL DEFAULT 'primary',
  image_role       text        NULL,
  -- dimensions
  aspect_ratio     text        NOT NULL DEFAULT '16:9',
  width            integer     NULL,
  height           integer     NULL,
  -- flags
  is_active        boolean     NOT NULL DEFAULT false,
  is_archived      boolean     NOT NULL DEFAULT false,
  -- misc
  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error_message    text        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── status CHECK ─────────────────────────────────────────────────────────────
DO $$
DECLARE v text;
BEGIN
  SELECT conname INTO v FROM pg_constraint
  WHERE conrelid='public.website_section_images'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%status%' LIMIT 1;
  IF v IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.website_section_images DROP CONSTRAINT %I', v);
  END IF;
END;$$;
ALTER TABLE public.website_section_images
  ADD CONSTRAINT website_section_images_status_check
  CHECK (status IN ('generated','active','archived','failed','ready'));

-- ── aspect_ratio CHECK ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.website_section_images'::regclass
      AND conname='website_section_images_aspect_ratio_check')
  THEN
    ALTER TABLE public.website_section_images
      ADD CONSTRAINT website_section_images_aspect_ratio_check
      CHECK (aspect_ratio IN ('1:1','9:16','16:9','4:3','3:4'));
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skip aspect_ratio check: %', SQLERRM;
END;$$;

-- ── FK: section_id → site_sections ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='site_sections')
  AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.website_section_images'::regclass
                  AND conname='website_section_images_section_id_fkey') THEN
    ALTER TABLE public.website_section_images ADD CONSTRAINT website_section_images_section_id_fkey
      FOREIGN KEY (section_id) REFERENCES public.site_sections(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skip section_id FK: %', SQLERRM;
END;$$;

-- ── FK: page_id → site_pages ─────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='site_pages')
  AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.website_section_images'::regclass
                  AND conname='website_section_images_page_id_fkey') THEN
    ALTER TABLE public.website_section_images ADD CONSTRAINT website_section_images_page_id_fkey
      FOREIGN KEY (page_id) REFERENCES public.site_pages(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skip page_id FK: %', SQLERRM;
END;$$;

-- ── active_image_id FK on plans (after website_section_images exists) ─────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
                 AND table_name='website_image_plans' AND column_name='active_image_id')
  THEN ALTER TABLE public.website_image_plans ADD COLUMN active_image_id uuid NULL; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.website_image_plans'::regclass
                 AND conname='website_image_plans_active_image_id_fkey') THEN
    ALTER TABLE public.website_image_plans ADD CONSTRAINT website_image_plans_active_image_id_fkey
      FOREIGN KEY (active_image_id) REFERENCES public.website_section_images(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Skip active_image_id FK: %', SQLERRM;
END;$$;

-- ── One active image per tenant+section+slot ──────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS website_section_images_one_active_per_slot_idx
  ON public.website_section_images(tenant_id, section_id, slot_key)
  WHERE is_active = true AND is_archived = false;

CREATE UNIQUE INDEX IF NOT EXISTS website_section_images_one_active_per_section_idx
  ON public.website_section_images(section_id)
  WHERE is_active = true AND is_archived = false;

-- ── Handle website_generated_images (TABLE from migration 057, or VIEW, or absent) ──
-- Uses pg_class.relkind: 'r' = regular table, 'v' = view.
-- No EXCEPTION handler so failures surface immediately instead of being hidden.
DO $$
DECLARE
  v_relkind char;
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'website_generated_images';

  IF v_relkind = 'r' THEN
    -- Regular TABLE (migration 057). Migrate rows then drop.
    RAISE NOTICE 'website_generated_images is a TABLE — migrating rows to website_section_images…';

    INSERT INTO public.website_section_images (
      id, tenant_id, page_id, section_id,
      plan_id, created_by,
      status, provider, image_model,
      storage_bucket, storage_path, image_url, public_url,
      prompt, alt_text, section_type, slot_key, image_role,
      aspect_ratio, is_active, is_archived, metadata,
      error_message, created_at, updated_at
    )
    SELECT
      id,
      tenant_id,
      page_id,
      section_id,
      image_plan_id,
      created_by,
      COALESCE(generation_status, 'generated'),
      'google-imagen',
      COALESCE(model, 'imagen-4.0-ultra-generate-001'),
      COALESCE(bucket, 'website-assets'),
      storage_path,
      COALESCE(public_url, ''),
      public_url,
      COALESCE(prompt, ''),
      alt_text,
      section_type,
      COALESCE(image_slot, 'primary'),
      image_role,
      COALESCE(aspect_ratio, '16:9'),
      COALESCE(is_active, false),
      COALESCE(is_archived, false),
      COALESCE(metadata, '{}'::jsonb),
      generation_error,
      created_at,
      updated_at
    FROM public.website_generated_images
    ON CONFLICT (id) DO NOTHING;

    DROP TABLE public.website_generated_images CASCADE;
    RAISE NOTICE 'Dropped website_generated_images table.';

  ELSIF v_relkind = 'v' THEN
    DROP VIEW public.website_generated_images;
    RAISE NOTICE 'Dropped existing website_generated_images view for recreation.';
  ELSE
    RAISE NOTICE 'website_generated_images does not exist — will be created as view.';
  END IF;
END;
$$;

-- Recreate website_generated_images as a VIEW over website_section_images
CREATE OR REPLACE VIEW public.website_generated_images AS
SELECT
  id,
  tenant_id,
  NULL::uuid  AS website_id,
  page_id,
  section_id,
  plan_id     AS image_plan_id,
  slot_key    AS image_slot,
  image_role,
  section_type,
  prompt,
  image_model AS model,
  NULL::text  AS requested_aspect_ratio,
  aspect_ratio,
  storage_bucket AS bucket,
  storage_path,
  image_url   AS public_url,
  alt_text,
  is_active,
  is_archived,
  status      AS generation_status,
  error_message AS generation_error,
  metadata,
  created_by,
  created_at,
  updated_at
FROM public.website_section_images;

-- =============================================================================
-- 4. Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_wip_tenant_id          ON public.website_image_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wip_tenant_status       ON public.website_image_plans(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_wip_page_id             ON public.website_image_plans(page_id)     WHERE page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wip_section_id          ON public.website_image_plans(section_id)  WHERE section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wip_tenant_section_id   ON public.website_image_plans(tenant_id, section_id);
CREATE INDEX IF NOT EXISTS idx_wip_job_id              ON public.website_image_plans(job_id)      WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wip_status              ON public.website_image_plans(status);
CREATE INDEX IF NOT EXISTS idx_wip_created_at          ON public.website_image_plans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wip_active_image_id     ON public.website_image_plans(active_image_id) WHERE active_image_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wij_tenant_id     ON public.website_image_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wij_plan_id       ON public.website_image_jobs(plan_id)   WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wij_status        ON public.website_image_jobs(status);
CREATE INDEX IF NOT EXISTS idx_wij_created_at    ON public.website_image_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wsi_tenant_id           ON public.website_section_images(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wsi_section_id          ON public.website_section_images(section_id);
CREATE INDEX IF NOT EXISTS idx_wsi_page_id             ON public.website_section_images(page_id)     WHERE page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wsi_plan_id             ON public.website_section_images(plan_id)     WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wsi_tenant_section       ON public.website_section_images(tenant_id, section_id);
CREATE INDEX IF NOT EXISTS idx_wsi_tenant_section_slot  ON public.website_section_images(tenant_id, section_id, slot_key);
CREATE INDEX IF NOT EXISTS idx_wsi_status              ON public.website_section_images(status);
CREATE INDEX IF NOT EXISTS idx_wsi_is_active           ON public.website_section_images(is_active)   WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_wsi_not_archived        ON public.website_section_images(tenant_id, section_id) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_wsi_created_at          ON public.website_section_images(created_at DESC);

-- =============================================================================
-- 5. Triggers
-- =============================================================================
DROP TRIGGER IF EXISTS website_image_plans_set_updated_at   ON public.website_image_plans;
DROP TRIGGER IF EXISTS website_image_jobs_set_updated_at    ON public.website_image_jobs;
DROP TRIGGER IF EXISTS website_section_images_set_updated_at ON public.website_section_images;

CREATE TRIGGER website_image_plans_set_updated_at
  BEFORE UPDATE ON public.website_image_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER website_image_jobs_set_updated_at
  BEFORE UPDATE ON public.website_image_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER website_section_images_set_updated_at
  BEFORE UPDATE ON public.website_section_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 6. activate_website_section_image function
-- =============================================================================
CREATE OR REPLACE FUNCTION public.activate_website_section_image(
  p_section_id uuid,
  p_image_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_image     public.website_section_images%ROWTYPE;
  v_image_url text;
BEGIN
  SELECT * INTO v_image
  FROM public.website_section_images
  WHERE id = p_image_id AND section_id = p_section_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Image % not found for section %', p_image_id, p_section_id;
  END IF;

  IF v_image.is_archived THEN
    RAISE EXCEPTION 'Cannot activate archived image %. Restore it first.', p_image_id;
  END IF;

  v_image_url := COALESCE(v_image.image_url, v_image.public_url);

  -- Deactivate all other images for same slot
  UPDATE public.website_section_images
  SET is_active  = false,
      status     = 'generated',
      updated_at = now()
  WHERE tenant_id  = v_image.tenant_id
    AND section_id = p_section_id
    AND slot_key   = v_image.slot_key
    AND id        != p_image_id;

  -- Activate selected image
  UPDATE public.website_section_images
  SET is_active   = true,
      is_archived = false,
      status      = 'active',
      updated_at  = now()
  WHERE id = p_image_id;

  -- Update related plan
  IF v_image.plan_id IS NOT NULL THEN
    UPDATE public.website_image_plans
    SET active_image_id = p_image_id,
        status          = 'applied',
        applied_at      = now(),
        updated_at      = now()
    WHERE id = v_image.plan_id;
  END IF;

  -- Patch live site_section content (defensive)
  IF v_image_url IS NOT NULL AND v_image_url != '' THEN
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='site_sections'
          AND column_name='content' AND data_type='jsonb'
      ) THEN
        UPDATE public.site_sections
        SET content    = jsonb_set(coalesce(content,'{}'), '{imageUrl}', to_jsonb(v_image_url), true),
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
    'slot_key',   v_image.slot_key
  );
END;
$$;

-- =============================================================================
-- 7. RLS
-- =============================================================================
ALTER TABLE public.website_image_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_image_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_section_images   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_image_plans"        ON public.website_image_plans;
DROP POLICY IF EXISTS "admin_tenant_image_plans"     ON public.website_image_plans;
DROP POLICY IF EXISTS "staff_tenant_image_plans"     ON public.website_image_plans;
DROP POLICY IF EXISTS "owner_all_image_jobs"         ON public.website_image_jobs;
DROP POLICY IF EXISTS "admin_tenant_image_jobs"      ON public.website_image_jobs;
DROP POLICY IF EXISTS "wsi_public_read"              ON public.website_section_images;
DROP POLICY IF EXISTS "wsi_select"                   ON public.website_section_images;
DROP POLICY IF EXISTS "wsi_insert"                   ON public.website_section_images;
DROP POLICY IF EXISTS "wsi_update"                   ON public.website_section_images;
DROP POLICY IF EXISTS "wsi_delete"                   ON public.website_section_images;

CREATE POLICY "owner_all_image_plans" ON public.website_image_plans FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'owner'));

CREATE POLICY "admin_tenant_image_plans" ON public.website_image_plans FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND role IN ('admin','staff','business')
      AND tenant_id = website_image_plans.tenant_id
  ));

CREATE POLICY "owner_all_image_jobs" ON public.website_image_jobs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'owner'));

CREATE POLICY "admin_tenant_image_jobs" ON public.website_image_jobs FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND role IN ('admin','staff','business')
      AND tenant_id = website_image_jobs.tenant_id
  ));

-- Public read: live business websites load images without auth
CREATE POLICY "wsi_public_read" ON public.website_section_images
  FOR SELECT USING (is_archived = false);

CREATE POLICY "wsi_select" ON public.website_section_images
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE auth_user_id = auth.uid()));

CREATE POLICY "wsi_insert" ON public.website_section_images
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM public.users
    WHERE auth_user_id = auth.uid() AND role IN ('owner','admin','staff','business')
  ));

CREATE POLICY "wsi_update" ON public.website_section_images
  FOR UPDATE TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM public.users
    WHERE auth_user_id = auth.uid() AND role IN ('owner','admin','staff','business')
  ));

CREATE POLICY "wsi_delete" ON public.website_section_images
  FOR DELETE TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM public.users
    WHERE auth_user_id = auth.uid() AND role IN ('owner','admin')
  ));

-- =============================================================================
-- 8. Storage buckets
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('website-assets','website-assets',true,10485760,
      ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/svg+xml'])
    ON CONFLICT (id) DO UPDATE SET public = true;

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('website-images','website-images',true,10485760,
      ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/svg+xml'])
    ON CONFLICT (id) DO UPDATE SET public = true;

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

    RAISE NOTICE 'Storage buckets and policies ready.';
  ELSE
    RAISE NOTICE 'storage schema not found — skip bucket setup.';
  END IF;
END;$$;

-- =============================================================================
-- DONE
-- Tables: website_image_plans, website_image_jobs, website_section_images
-- View:   website_generated_images (backward-compat alias)
-- Fn:     activate_website_section_image(section_id, image_id)
-- =============================================================================
