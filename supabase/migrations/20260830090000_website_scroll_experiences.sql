-- Multi-tenant Scroll Experience processing, immutable versions, assets and analytics.
-- Source uploads and every derivative remain private. Public delivery is allowed only
-- through an active published binding created by the canonical website publisher.

-- Composite parent keys make it impossible to attach a child row to an object
-- owned by another tenant, even when writes use the service role.
CREATE UNIQUE INDEX IF NOT EXISTS websites_tenant_id_uidx
  ON public.websites (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS site_pages_tenant_id_uidx
  ON public.site_pages (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS site_versions_tenant_id_uidx
  ON public.site_versions (tenant_id, id);

CREATE TABLE IF NOT EXISTS public.website_scroll_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  website_id uuid,
  page_id uuid,
  component_instance_id text,
  name text NOT NULL DEFAULT 'Untitled Scroll Experience',
  status text NOT NULL DEFAULT 'UPLOADING' CHECK (status IN (
    'UPLOADING','UPLOADED','QUEUED','INSPECTING','PROCESSING_DESKTOP',
    'PROCESSING_MOBILE','GENERATING_POSTER','READY','FAILED','ARCHIVED'
  )),
  active_version_id uuid,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (tenant_id, id),
  CONSTRAINT website_scroll_experiences_website_tenant_fk
    FOREIGN KEY (tenant_id, website_id) REFERENCES public.websites(tenant_id, id) ON DELETE SET NULL (website_id),
  CONSTRAINT website_scroll_experiences_page_tenant_fk
    FOREIGN KEY (tenant_id, page_id) REFERENCES public.site_pages(tenant_id, id) ON DELETE SET NULL (page_id)
);

CREATE TABLE IF NOT EXISTS public.website_scroll_experience_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  experience_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'UPLOADING' CHECK (status IN (
    'UPLOADING','UPLOADED','QUEUED','INSPECTING','PROCESSING_DESKTOP',
    'PROCESSING_MOBILE','GENERATING_POSTER','READY','FAILED','ARCHIVED'
  )),
  processing_version text NOT NULL DEFAULT 'scroll-video-v1',
  processing_attempts integer NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
  processing_error_category text,
  processing_started_at timestamptz,
  processed_at timestamptz,
  duration_seconds numeric,
  source_width integer,
  source_height integer,
  source_fps numeric,
  source_codec text,
  source_pixel_format text,
  source_rotation integer,
  source_bitrate bigint,
  source_has_audio boolean,
  source_bytes bigint,
  desktop_width integer,
  desktop_height integer,
  desktop_bytes bigint,
  mobile_width integer,
  mobile_height integer,
  mobile_bytes bigint,
  poster_bytes bigint,
  processing_duration_ms bigint,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, experience_id, version_number),
  CONSTRAINT website_scroll_versions_experience_tenant_fk
    FOREIGN KEY (tenant_id, experience_id) REFERENCES public.website_scroll_experiences(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE public.website_scroll_experiences
  DROP CONSTRAINT IF EXISTS website_scroll_experiences_active_version_fk;
ALTER TABLE public.website_scroll_experiences
  ADD CONSTRAINT website_scroll_experiences_active_version_fk
  FOREIGN KEY (tenant_id, active_version_id) REFERENCES public.website_scroll_experience_versions(tenant_id, id) ON DELETE SET NULL (active_version_id);

CREATE TABLE IF NOT EXISTS public.website_scroll_experience_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  experience_id uuid NOT NULL,
  experience_version_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('source','desktop','mobile','poster')),
  bucket text NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes >= 0),
  width integer,
  height integer,
  duration_seconds numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, experience_version_id, kind),
  UNIQUE (tenant_id, id),
  UNIQUE (bucket, object_key),
  CONSTRAINT website_scroll_assets_experience_tenant_fk
    FOREIGN KEY (tenant_id, experience_id) REFERENCES public.website_scroll_experiences(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT website_scroll_assets_version_tenant_fk
    FOREIGN KEY (tenant_id, experience_version_id) REFERENCES public.website_scroll_experience_versions(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.website_scroll_experience_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  experience_id uuid NOT NULL,
  experience_version_id uuid NOT NULL,
  source_asset_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','COMPLETED','FAILED')),
  queue_message_id text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_scroll_jobs_experience_tenant_fk
    FOREIGN KEY (tenant_id, experience_id) REFERENCES public.website_scroll_experiences(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT website_scroll_jobs_version_tenant_fk
    FOREIGN KEY (tenant_id, experience_version_id) REFERENCES public.website_scroll_experience_versions(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT website_scroll_jobs_asset_tenant_fk
    FOREIGN KEY (tenant_id, source_asset_id) REFERENCES public.website_scroll_experience_assets(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.website_scroll_published_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_version_id uuid NOT NULL,
  experience_id uuid NOT NULL,
  experience_version_id uuid NOT NULL,
  component_instance_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_version_id, component_instance_id),
  CONSTRAINT website_scroll_bindings_site_version_tenant_fk
    FOREIGN KEY (tenant_id, site_version_id) REFERENCES public.site_versions(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT website_scroll_bindings_experience_tenant_fk
    FOREIGN KEY (tenant_id, experience_id) REFERENCES public.website_scroll_experiences(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT website_scroll_bindings_version_tenant_fk
    FOREIGN KEY (tenant_id, experience_version_id) REFERENCES public.website_scroll_experience_versions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.website_scroll_experience_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  experience_id uuid NOT NULL,
  experience_version_id uuid,
  component_instance_id text,
  event_name text NOT NULL CHECK (event_name IN (
    'scroll_experience_view','scroll_experience_started','scroll_experience_25',
    'scroll_experience_50','scroll_experience_75','scroll_experience_completed',
    'scroll_experience_cta_clicked'
  )),
  session_hash text NOT NULL,
  page_path text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_scroll_events_experience_tenant_fk
    FOREIGN KEY (tenant_id, experience_id) REFERENCES public.website_scroll_experiences(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT website_scroll_events_version_tenant_fk
    FOREIGN KEY (tenant_id, experience_version_id) REFERENCES public.website_scroll_experience_versions(tenant_id, id) ON DELETE SET NULL (experience_version_id)
);

CREATE TABLE IF NOT EXISTS public.website_scroll_experience_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  experience_id uuid NOT NULL,
  event_name text NOT NULL CHECK (event_name IN (
    'SCROLL_EXPERIENCE_CREATED','SCROLL_VIDEO_UPLOAD_STARTED','SCROLL_VIDEO_UPLOADED',
    'SCROLL_VIDEO_PROCESSING_STARTED','SCROLL_VIDEO_PROCESSING_COMPLETED',
    'SCROLL_VIDEO_PROCESSING_FAILED','SCROLL_EXPERIENCE_UPDATED',
    'SCROLL_EXPERIENCE_PUBLISHED','SCROLL_EXPERIENCE_ARCHIVED','SCROLL_VIDEO_RETRY_STARTED'
  )),
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_scroll_audit_experience_tenant_fk
    FOREIGN KEY (tenant_id, experience_id) REFERENCES public.website_scroll_experiences(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS website_scroll_experiences_tenant_idx
  ON public.website_scroll_experiences (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS website_scroll_versions_ready_idx
  ON public.website_scroll_experience_versions (tenant_id, status, processed_at DESC);
CREATE INDEX IF NOT EXISTS website_scroll_assets_version_idx
  ON public.website_scroll_experience_assets (tenant_id, experience_version_id, kind);
CREATE INDEX IF NOT EXISTS website_scroll_jobs_status_idx
  ON public.website_scroll_experience_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS website_scroll_bindings_public_idx
  ON public.website_scroll_published_bindings (experience_version_id, active);
CREATE INDEX IF NOT EXISTS website_scroll_events_tenant_idx
  ON public.website_scroll_experience_events (tenant_id, occurred_at DESC, event_name);
CREATE INDEX IF NOT EXISTS website_scroll_audit_tenant_idx
  ON public.website_scroll_experience_audit (tenant_id, created_at DESC, event_name);
CREATE UNIQUE INDEX IF NOT EXISTS website_scroll_events_once_idx
  ON public.website_scroll_experience_events (experience_version_id, component_instance_id, session_hash, event_name);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'touch_updated_at') THEN
    DROP TRIGGER IF EXISTS website_scroll_experiences_updated_at ON public.website_scroll_experiences;
    CREATE TRIGGER website_scroll_experiences_updated_at BEFORE UPDATE ON public.website_scroll_experiences
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
    DROP TRIGGER IF EXISTS website_scroll_versions_updated_at ON public.website_scroll_experience_versions;
    CREATE TRIGGER website_scroll_versions_updated_at BEFORE UPDATE ON public.website_scroll_experience_versions
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
    DROP TRIGGER IF EXISTS website_scroll_jobs_updated_at ON public.website_scroll_experience_jobs;
    CREATE TRIGGER website_scroll_jobs_updated_at BEFORE UPDATE ON public.website_scroll_experience_jobs
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_sections_type_check' AND conrelid = 'public.site_sections'::regclass) THEN
    ALTER TABLE public.site_sections DROP CONSTRAINT site_sections_type_check;
  END IF;
  ALTER TABLE public.site_sections ADD CONSTRAINT site_sections_type_check CHECK (section_type IN (
    'hero','feature_grid','image_gallery','gallery','product_grid','testimonials','faq','cta',
    'contact','rich_text','banner','about','product_360','product_360_viewer',
    'premium_3d_scroll_hero','scroll_experience','custom'
  )) NOT VALID;
END $$;

ALTER TABLE public.website_scroll_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_scroll_experience_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_scroll_experience_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_scroll_experience_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_scroll_published_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_scroll_experience_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_scroll_experience_audit ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'website_scroll_experiences','website_scroll_experience_versions',
    'website_scroll_experience_assets','website_scroll_experience_jobs',
    'website_scroll_published_bindings','website_scroll_experience_events',
    'website_scroll_experience_audit'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON public.%I', table_name);
    EXECUTE format('CREATE POLICY service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS website_scroll_experiences_tenant_admin ON public.website_scroll_experiences;
CREATE POLICY website_scroll_experiences_tenant_admin ON public.website_scroll_experiences
  FOR ALL TO authenticated USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS website_scroll_versions_tenant_admin ON public.website_scroll_experience_versions;
CREATE POLICY website_scroll_versions_tenant_admin ON public.website_scroll_experience_versions
  FOR ALL TO authenticated USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS website_scroll_assets_tenant_admin ON public.website_scroll_experience_assets;
CREATE POLICY website_scroll_assets_tenant_admin ON public.website_scroll_experience_assets
  FOR ALL TO authenticated USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS website_scroll_jobs_tenant_read ON public.website_scroll_experience_jobs;
CREATE POLICY website_scroll_jobs_tenant_read ON public.website_scroll_experience_jobs
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS website_scroll_bindings_tenant_read ON public.website_scroll_published_bindings;
CREATE POLICY website_scroll_bindings_tenant_read ON public.website_scroll_published_bindings
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS website_scroll_events_tenant_read ON public.website_scroll_experience_events;
CREATE POLICY website_scroll_events_tenant_read ON public.website_scroll_experience_events
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS website_scroll_audit_tenant_read ON public.website_scroll_experience_audit;
CREATE POLICY website_scroll_audit_tenant_read ON public.website_scroll_experience_audit
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));

COMMENT ON TABLE public.website_scroll_experiences IS
  'Logical tenant-owned Scroll Experiences. business_id is intentionally absent; tenant_id is the sole tenancy key.';
