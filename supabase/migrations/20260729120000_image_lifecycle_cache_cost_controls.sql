-- Production image lifecycle, duplicate detection, AI cache, usage, retention,
-- legal hold, restore and deletion-control schema for private van-damage evidence.

ALTER TABLE public.van_damage_images
  ADD COLUMN IF NOT EXISTS original_sha256 text,
  ADD COLUMN IF NOT EXISTS perceptual_hash text,
  ADD COLUMN IF NOT EXISTS duplicate_of_image_id uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_status text NOT NULL DEFAULT 'unique'
    CHECK (duplicate_status IN ('unique','exact_duplicate','possible_duplicate','reused_original')),
  ADD COLUMN IF NOT EXISTS duplicate_confidence numeric CHECK (
    duplicate_confidence IS NULL OR duplicate_confidence BETWEEN 0 AND 1
  ),
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active','archive_eligible','archived','restore_requested','restored','delete_blocked','delete_eligible','deleted')),
  ADD COLUMN IF NOT EXISTS evidence_integrity_status text NOT NULL DEFAULT 'unverified'
    CHECK (evidence_integrity_status IN ('unverified','verified','mismatch','missing','failed')),
  ADD COLUMN IF NOT EXISTS retention_until timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_eligible_at timestamptz;

CREATE INDEX IF NOT EXISTS van_damage_images_hash_tenant_idx
  ON public.van_damage_images (tenant_id, original_sha256)
  WHERE original_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS van_damage_images_lifecycle_idx
  ON public.van_damage_images (tenant_id, lifecycle_state, deletion_eligible_at);

CREATE TABLE IF NOT EXISTS public.van_damage_image_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inspection_id uuid REFERENCES public.van_damage_inspections(id) ON DELETE SET NULL,
  image_id uuid REFERENCES public.van_damage_images(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('original','thumbnail','medium','large','overlay','export')),
  derivative_profile text NOT NULL DEFAULT 'original'
    CHECK (derivative_profile IN ('original','thumbnail','medium','large')),
  derivative_version text NOT NULL DEFAULT 'original',
  storage_provider text NOT NULL DEFAULT 's3',
  bucket text NOT NULL,
  object_key text NOT NULL,
  storage_class text NOT NULL DEFAULT 'STANDARD',
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  width integer CHECK (width IS NULL OR width >= 0),
  height integer CHECK (height IS NULL OR height >= 0),
  sha256 text,
  source_sha256 text,
  source text NOT NULL DEFAULT 'worker' CHECK (source IN ('slack','manual_upload','mobile_app','api','import','worker','system')),
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active','reused','processing','failed','archived','restore_requested','restored','deleting','deleted')
  ),
  cache_control text,
  retention_class text NOT NULL DEFAULT 'standard',
  lifecycle_policy_version text NOT NULL DEFAULT 'image-lifecycle-v1',
  legal_hold boolean NOT NULL DEFAULT false,
  retention_until timestamptz,
  transition_after timestamptz,
  deletion_eligible_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_image_assets_scope CHECK (business_id = tenant_id),
  CONSTRAINT van_damage_image_assets_tenant_key CHECK (object_key LIKE ('tenants/' || tenant_id::text || '/%'))
);

CREATE UNIQUE INDEX IF NOT EXISTS van_damage_image_assets_image_asset_uidx
  ON public.van_damage_image_assets (tenant_id, image_id, asset_type, derivative_profile, derivative_version);
CREATE INDEX IF NOT EXISTS van_damage_image_assets_hash_idx
  ON public.van_damage_image_assets (tenant_id, asset_type, sha256)
  WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS van_damage_image_assets_source_hash_idx
  ON public.van_damage_image_assets (tenant_id, asset_type, source_sha256)
  WHERE source_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS van_damage_image_assets_object_idx
  ON public.van_damage_image_assets (bucket, object_key);
CREATE INDEX IF NOT EXISTS van_damage_image_assets_lifecycle_idx
  ON public.van_damage_image_assets (tenant_id, status, deletion_eligible_at);

CREATE TABLE IF NOT EXISTS public.van_damage_ai_cache_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  image_sha256 text NOT NULL,
  comparison_reference_sha256 text,
  task_type text NOT NULL CHECK (
    task_type IN ('image_quality','camera_angle','damage_detection','before_after_comparison','repair_verification','overlay_generation')
  ),
  task_version text NOT NULL,
  prompt_version text,
  model_capability_version text NOT NULL,
  preprocessing_version text NOT NULL,
  configuration_version text NOT NULL DEFAULT 'image-lifecycle-v1',
  status text NOT NULL DEFAULT 'completed' CHECK (
    status IN ('completed','needs_review','failed','invalidated','corrupt')
  ),
  result_schema_version text NOT NULL DEFAULT 'van-damage-result-v1',
  result jsonb NOT NULL DEFAULT '{}',
  summary text,
  confidence numeric CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  human_invalidated_at timestamptz,
  invalidation_reason text,
  estimated_cost numeric NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  estimated_cost_avoided numeric NOT NULL DEFAULT 0 CHECK (estimated_cost_avoided >= 0),
  hit_count integer NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  last_hit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_ai_cache_entries_scope CHECK (business_id = tenant_id),
  UNIQUE (tenant_id, cache_key)
);
CREATE INDEX IF NOT EXISTS van_damage_ai_cache_entries_hash_idx
  ON public.van_damage_ai_cache_entries (tenant_id, image_sha256, task_type, task_version);

CREATE TABLE IF NOT EXISTS public.storage_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  image_id uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  inspection_id uuid REFERENCES public.van_damage_inspections(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.van_damage_image_assets(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (
    event_type IN ('upload','derivative_created','duplicate_reused','signed_url_issued','transition','restore_requested','restore_completed','delete_scheduled','delete_completed','integrity_mismatch')
  ),
  asset_type text CHECK (asset_type IS NULL OR asset_type IN ('original','thumbnail','medium','large','overlay','export')),
  storage_provider text NOT NULL DEFAULT 's3',
  storage_class text,
  byte_delta bigint NOT NULL DEFAULT 0,
  object_count_delta integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_usage_events_scope CHECK (business_id IS NULL OR business_id = tenant_id)
);
CREATE INDEX IF NOT EXISTS storage_usage_events_tenant_time_idx
  ON public.storage_usage_events (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  inspection_id uuid REFERENCES public.van_damage_inspections(id) ON DELETE SET NULL,
  image_id uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ai_run_id uuid REFERENCES public.van_damage_ai_runs(id) ON DELETE SET NULL,
  cache_entry_id uuid REFERENCES public.van_damage_ai_cache_entries(id) ON DELETE SET NULL,
  task_type text NOT NULL,
  task_version text NOT NULL,
  provider_capability text NOT NULL DEFAULT 'primary_vision',
  cache_status text NOT NULL CHECK (cache_status IN ('hit','miss','bypass','write','skip')),
  skip_reason text,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  input_width integer CHECK (input_width IS NULL OR input_width >= 0),
  input_height integer CHECK (input_height IS NULL OR input_height >= 0),
  input_bytes bigint CHECK (input_bytes IS NULL OR input_bytes >= 0),
  estimated_cost numeric NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  estimated_cost_avoided numeric NOT NULL DEFAULT 0 CHECK (estimated_cost_avoided >= 0),
  failure_category text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_events_scope CHECK (business_id IS NULL OR business_id = tenant_id)
);
CREATE INDEX IF NOT EXISTS ai_usage_events_tenant_time_idx
  ON public.ai_usage_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_task_idx
  ON public.ai_usage_events (tenant_id, task_type, cache_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'standard' CHECK (
    plan IN ('standard','extended_3_year','extended_5_year','extended_7_year','custom')
  ),
  original_retention_days integer NOT NULL DEFAULT 365 CHECK (original_retention_days >= 365),
  derivative_retention_days integer NOT NULL DEFAULT 365 CHECK (derivative_retention_days >= 30),
  audit_retention_days integer NOT NULL DEFAULT 2555 CHECK (audit_retention_days >= 365),
  deletion_grace_days integer NOT NULL DEFAULT 30 CHECK (deletion_grace_days >= 7),
  legal_hold_default boolean NOT NULL DEFAULT false,
  owner_locked boolean NOT NULL DEFAULT false,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS public.legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  image_id uuid REFERENCES public.van_damage_images(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  inspection_id uuid REFERENCES public.van_damage_inspections(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  placed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  released_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  released_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legal_holds_tenant_status_idx
  ON public.legal_holds (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.storage_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.van_damage_image_assets(id) ON DELETE SET NULL,
  image_id uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (
    event_type IN ('tag_requested','tag_applied','transition_due','transition_applied','archive_requested','restore_requested','restore_available','delete_blocked','delete_scheduled','delete_completed','failed')
  ),
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','queued','processing','completed','failed','cancelled')),
  lifecycle_policy_version text NOT NULL DEFAULT 'image-lifecycle-v1',
  failure_category text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storage_lifecycle_events_tenant_idx
  ON public.storage_lifecycle_events (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.archive_restore_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.van_damage_image_assets(id) ON DELETE CASCADE,
  image_id uuid REFERENCES public.van_damage_images(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (
    status IN ('requested','queued','restoring','available','failed','expired','cancelled')
  ),
  restore_tier text NOT NULL DEFAULT 'standard',
  available_until timestamptz,
  failure_message text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, asset_id, status)
);

CREATE TABLE IF NOT EXISTS public.deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.van_damage_image_assets(id) ON DELETE SET NULL,
  image_id uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'eligible' CHECK (
    status IN ('eligible','scheduled','blocked','deleting','deleted','failed','cancelled')
  ),
  dry_run boolean NOT NULL DEFAULT true,
  blocked_reason text,
  scheduled_for timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deletion_jobs_tenant_status_idx
  ON public.deletion_jobs (tenant_id, status, scheduled_for);

ALTER TABLE public.van_damage_image_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.van_damage_ai_cache_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_restore_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deletion_jobs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'van_damage_image_assets','van_damage_ai_cache_entries','storage_usage_events',
    'ai_usage_events','retention_policies','legal_holds','storage_lifecycle_events',
    'archive_restore_requests','deletion_jobs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all_%1$s ON public.%1$I', table_name);
    EXECUTE format('CREATE POLICY service_role_all_%1$s ON public.%1$I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END $$;

CREATE POLICY tenant_read_van_damage_image_assets ON public.van_damage_image_assets
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND (u.role = 'owner' OR u.tenant_id = van_damage_image_assets.tenant_id))
  );
CREATE POLICY tenant_read_storage_usage_events ON public.storage_usage_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND (u.role = 'owner' OR u.tenant_id = storage_usage_events.tenant_id))
  );
CREATE POLICY tenant_read_ai_usage_events ON public.ai_usage_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND (u.role = 'owner' OR u.tenant_id = ai_usage_events.tenant_id))
  );
CREATE POLICY tenant_read_retention_policies ON public.retention_policies
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND (u.role = 'owner' OR u.tenant_id = retention_policies.tenant_id))
  );
CREATE POLICY tenant_read_legal_holds ON public.legal_holds
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND (u.role = 'owner' OR u.tenant_id = legal_holds.tenant_id))
  );
CREATE POLICY owner_read_lifecycle_events ON public.storage_lifecycle_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'owner')
  );
CREATE POLICY owner_read_cache_entries ON public.van_damage_ai_cache_entries
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'owner')
  );
CREATE POLICY owner_read_restore_requests ON public.archive_restore_requests
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'owner')
  );
CREATE POLICY owner_read_deletion_jobs ON public.deletion_jobs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'owner')
  );

CREATE OR REPLACE FUNCTION public.get_owner_image_operations_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH storage AS (
    SELECT
      COALESCE(sum(byte_size) FILTER (WHERE asset_type = 'original' AND status <> 'deleted'), 0) AS original_bytes,
      COALESCE(sum(byte_size) FILTER (WHERE asset_type IN ('thumbnail','medium','large') AND status <> 'deleted'), 0) AS derivative_bytes,
      count(*) FILTER (WHERE status <> 'deleted') AS asset_count,
      count(DISTINCT tenant_id) AS tenant_count
    FROM public.van_damage_image_assets
  ),
  images AS (
    SELECT
      count(*) AS image_count,
      count(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS images_today,
      count(*) FILTER (WHERE duplicate_status IN ('exact_duplicate','reused_original')) AS duplicates
    FROM public.van_damage_images
  ),
  ai AS (
    SELECT
      count(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS tasks_today,
      count(*) FILTER (WHERE cache_status = 'hit') AS cache_hits,
      count(*) FILTER (WHERE cache_status = 'miss') AS cache_misses,
      COALESCE(sum(estimated_cost), 0) AS estimated_cost,
      COALESCE(sum(estimated_cost_avoided), 0) AS estimated_cost_avoided
    FROM public.ai_usage_events
  ),
  jobs AS (
    SELECT
      count(*) FILTER (WHERE status IN ('queued','processing')) AS active_jobs,
      count(*) FILTER (WHERE status = 'failed') AS failed_jobs,
      min(created_at) FILTER (WHERE status IN ('queued','processing')) AS oldest_active_job
    FROM public.van_damage_jobs
  )
  SELECT jsonb_build_object(
    'storage', row_to_json(storage),
    'images', row_to_json(images),
    'ai', row_to_json(ai),
    'queue', row_to_json(jobs),
    'generatedAt', now()
  )
  FROM storage, images, ai, jobs;
$$;

GRANT SELECT ON public.van_damage_image_assets, public.storage_usage_events, public.ai_usage_events,
  public.retention_policies, public.legal_holds TO authenticated;
GRANT SELECT ON public.storage_lifecycle_events, public.van_damage_ai_cache_entries,
  public.archive_restore_requests, public.deletion_jobs TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_image_operations_summary() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.van_damage_worker_schema_contract()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'version','2026-07-29-v1','businessScope','tenant_id_equals_business_id',
    'claimRpc','tenant_business_inspection_image_scoped',
    'jobIdentity','tenant_inspection_image_analysis_version',
    'imageLifecycle','hash_derivatives_cache_usage_v1',
    'tables',jsonb_build_array(
      'van_slack_integrations','van_damage_jobs','van_damage_inspections',
      'van_damage_images','van_damage_image_analyses','van_damage_ai_runs','van_damage_items',
      'van_damage_image_assets','van_damage_ai_cache_entries','storage_usage_events',
      'ai_usage_events','retention_policies','legal_holds','storage_lifecycle_events',
      'archive_restore_requests','deletion_jobs'
    )
  )
$$;

GRANT EXECUTE ON FUNCTION public.van_damage_worker_schema_contract() TO service_role;

NOTIFY pgrst, 'reload schema';
