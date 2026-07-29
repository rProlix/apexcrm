-- Per-image analysis jobs and authoritative inspection aggregation.
-- Successful image results are immutable with respect to failures in sibling images.

ALTER TABLE public.van_damage_jobs
  ADD COLUMN IF NOT EXISTS image_id uuid REFERENCES public.van_damage_images(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS analysis_version text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS failure_category text,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

ALTER TABLE public.van_damage_ai_runs
  ADD COLUMN IF NOT EXISTS image_id uuid REFERENCES public.van_damage_images(id) ON DELETE CASCADE;

UPDATE public.van_damage_jobs
SET analysis_version = 'van-damage-v1'
WHERE analysis_version IS NULL;
ALTER TABLE public.van_damage_jobs
  ALTER COLUMN analysis_version SET DEFAULT 'van-damage-v1',
  ALTER COLUMN analysis_version SET NOT NULL;

ALTER TABLE public.van_damage_inspections
  ADD COLUMN IF NOT EXISTS analysis_aggregate_status text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS analyzed_image_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_image_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_review_image_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_image_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.van_damage_inspections
  DROP CONSTRAINT IF EXISTS van_damage_inspections_analysis_aggregate_status_check;
ALTER TABLE public.van_damage_inspections
  ADD CONSTRAINT van_damage_inspections_analysis_aggregate_status_check CHECK (
    analysis_aggregate_status IN (
      'awaiting_images','queued','processing','partially_complete','complete',
      'complete_with_warnings','needs_review','failed','no_analyzable_images'
    )
  );

ALTER TABLE public.van_damage_images DROP CONSTRAINT IF EXISTS van_damage_images_status_check;
ALTER TABLE public.van_damage_images
  ADD CONSTRAINT van_damage_images_status_check CHECK (
    status IN (
      'queued','downloading','uploaded','processing','analyzed','needs_review',
      'failed','skipped','cancelled'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS van_damage_jobs_image_analysis_key_uidx
  ON public.van_damage_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS van_damage_jobs_image_idx
  ON public.van_damage_jobs (tenant_id, inspection_id, image_id, created_at DESC);
CREATE INDEX IF NOT EXISTS van_damage_ai_runs_image_idx
  ON public.van_damage_ai_runs (tenant_id, inspection_id, image_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.van_damage_image_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES public.van_damage_inspections(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES public.van_damage_images(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.van_damage_jobs(id) ON DELETE SET NULL,
  ai_run_id uuid REFERENCES public.van_damage_ai_runs(id) ON DELETE SET NULL,
  analysis_version text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued','processing','completed','needs_review','failed','skipped','cancelled')
  ),
  valid_confidence numeric CHECK (
    valid_confidence IS NULL OR valid_confidence BETWEEN 0 AND 1
  ),
  damage_count integer NOT NULL DEFAULT 0 CHECK (damage_count >= 0),
  summary text,
  needs_human_review boolean NOT NULL DEFAULT false,
  failure_category text CHECK (
    failure_category IS NULL OR failure_category IN (
      'download_failed','unsupported_format','corrupt_image','quality_insufficient',
      'provider_timeout','provider_rate_limited','provider_unavailable',
      'invalid_response','identity_uncertain','unknown'
    )
  ),
  failure_message text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_image_analyses_scope CHECK (business_id = tenant_id),
  UNIQUE (tenant_id, image_id, analysis_version)
);
CREATE INDEX IF NOT EXISTS van_damage_image_analyses_inspection_idx
  ON public.van_damage_image_analyses (tenant_id, inspection_id, status);

CREATE OR REPLACE FUNCTION public.recalculate_van_damage_inspection_analysis(
  p_tenant_id uuid,
  p_inspection_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inspection_row public.van_damage_inspections%ROWTYPE;
  total_count integer;
  queued_count integer;
  processing_count integer;
  completed_count integer;
  review_count integer;
  failed_count integer;
  skipped_count integer;
  valid_confidence_count integer;
  aggregate_confidence numeric;
  aggregate_damage_count integer;
  aggregate_summary text;
  aggregate_state text;
  public_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_inspection_id::text, 0));
  SELECT * INTO inspection_row
  FROM public.van_damage_inspections
  WHERE id = p_inspection_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection scope mismatch'; END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE COALESCE(a.status, i.status) IN ('queued','uploaded','downloading')),
    count(*) FILTER (WHERE COALESCE(a.status, i.status) = 'processing'),
    count(*) FILTER (WHERE a.status = 'completed'),
    count(*) FILTER (WHERE a.status = 'needs_review'),
    count(*) FILTER (WHERE a.status = 'failed'),
    count(*) FILTER (WHERE a.status IN ('skipped','cancelled')),
    count(*) FILTER (WHERE a.status IN ('completed','needs_review') AND a.valid_confidence IS NOT NULL),
    avg(a.valid_confidence) FILTER (
      WHERE a.status IN ('completed','needs_review') AND a.valid_confidence IS NOT NULL
    ),
    COALESCE(sum(a.damage_count) FILTER (WHERE a.status IN ('completed','needs_review')), 0)
  INTO
    total_count, queued_count, processing_count, completed_count, review_count,
    failed_count, skipped_count, valid_confidence_count, aggregate_confidence,
    aggregate_damage_count
  FROM public.van_damage_images i
  LEFT JOIN public.van_damage_image_analyses a
    ON a.image_id = i.id AND a.tenant_id = i.tenant_id
  WHERE i.inspection_id = p_inspection_id
    AND i.tenant_id = p_tenant_id
    AND i.business_id = inspection_row.business_id
    AND i.status <> 'cancelled';

  IF total_count = 0 THEN
    aggregate_state := 'awaiting_images';
    public_status := 'queued';
  ELSIF processing_count > 0 THEN
    aggregate_state := CASE WHEN completed_count + review_count > 0 THEN 'partially_complete' ELSE 'processing' END;
    public_status := 'processing';
  ELSIF queued_count > 0 THEN
    aggregate_state := CASE WHEN completed_count + review_count > 0 THEN 'partially_complete' ELSE 'queued' END;
    public_status := CASE WHEN completed_count + review_count > 0 THEN 'processing' ELSE 'queued' END;
  ELSIF completed_count > 0 AND failed_count + skipped_count + review_count > 0 THEN
    aggregate_state := 'complete_with_warnings';
    public_status := 'needs_review';
  ELSIF completed_count > 0 THEN
    aggregate_state := 'complete';
    public_status := 'completed';
  ELSIF review_count > 0 THEN
    aggregate_state := 'needs_review';
    public_status := 'needs_review';
  ELSIF failed_count > 0 THEN
    aggregate_state := 'failed';
    public_status := 'failed';
  ELSE
    aggregate_state := 'no_analyzable_images';
    public_status := 'needs_review';
  END IF;

  SELECT string_agg(summary, ' ')
  INTO aggregate_summary
  FROM (
    SELECT a.summary
    FROM public.van_damage_image_analyses a
    WHERE a.tenant_id = p_tenant_id
      AND a.inspection_id = p_inspection_id
      AND a.status IN ('completed','needs_review')
      AND NULLIF(trim(a.summary), '') IS NOT NULL
    ORDER BY a.created_at, a.image_id
  ) summaries;

  UPDATE public.van_damage_inspections
  SET status = public_status,
      analysis_aggregate_status = aggregate_state,
      image_count = total_count,
      analyzed_image_count = completed_count,
      failed_image_count = failed_count,
      needs_review_image_count = review_count,
      skipped_image_count = skipped_count,
      damage_count = aggregate_damage_count,
      ai_confidence = CASE WHEN valid_confidence_count > 0 THEN aggregate_confidence ELSE NULL END,
      ai_summary = NULLIF(aggregate_summary, ''),
      completed_at = CASE
        WHEN queued_count = 0 AND processing_count = 0 THEN COALESCE(completed_at, now())
        ELSE NULL
      END,
      error_message = CASE
        WHEN aggregate_state = 'failed' THEN 'All image analyses failed.'
        WHEN aggregate_state = 'no_analyzable_images' THEN 'No images could be analyzed.'
        WHEN aggregate_state = 'complete_with_warnings' THEN 'Some images need attention.'
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_inspection_id
    AND tenant_id = p_tenant_id
    AND business_id = inspection_row.business_id;

  RETURN jsonb_build_object(
    'status', aggregate_state,
    'total', total_count,
    'queued', queued_count,
    'processing', processing_count,
    'completed', completed_count,
    'needsReview', review_count,
    'failed', failed_count,
    'skipped', skipped_count,
    'validConfidenceCount', valid_confidence_count,
    'confidence', CASE WHEN valid_confidence_count > 0 THEN aggregate_confidence ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_van_damage_image_job(
  p_job_id uuid,
  p_tenant_id uuid,
  p_business_id uuid,
  p_inspection_id uuid,
  p_image_id uuid,
  p_stale_before timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE current_job public.van_damage_jobs%ROWTYPE;
BEGIN
  IF p_business_id <> p_tenant_id THEN RETURN 'missing'; END IF;
  SELECT * INTO current_job
  FROM public.van_damage_jobs
  WHERE id = p_job_id AND tenant_id = p_tenant_id AND business_id = p_business_id
    AND inspection_id = p_inspection_id AND image_id = p_image_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF current_job.status = 'completed' THEN RETURN 'completed'; END IF;
  IF current_job.status = 'processing' AND current_job.updated_at >= p_stale_before THEN RETURN 'busy'; END IF;

  UPDATE public.van_damage_jobs
  SET status = 'processing', attempt_count = attempt_count + 1,
      started_at = COALESCE(started_at, now()), last_attempt_at = now(),
      last_error = NULL, failure_category = NULL, updated_at = now()
  WHERE id = p_job_id;
  UPDATE public.van_damage_images
  SET status = 'processing', updated_at = now()
  WHERE id = p_image_id AND tenant_id = p_tenant_id AND inspection_id = p_inspection_id;
  INSERT INTO public.van_damage_image_analyses (
    tenant_id,business_id,inspection_id,image_id,job_id,analysis_version,status,
    attempt_count,last_attempt_at
  ) VALUES (
    p_tenant_id,p_business_id,p_inspection_id,p_image_id,p_job_id,
    COALESCE(current_job.analysis_version,'van-damage-v1'),'processing',1,now()
  )
  ON CONFLICT (tenant_id,image_id,analysis_version) DO UPDATE SET
    job_id = EXCLUDED.job_id,
    status = 'processing',
    attempt_count = van_damage_image_analyses.attempt_count + 1,
    last_attempt_at = now(),
    failure_category = NULL,
    failure_message = NULL,
    updated_at = now();
  PERFORM public.recalculate_van_damage_inspection_analysis(p_tenant_id,p_inspection_id);
  RETURN 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_van_damage_image_job(
  p_job_id uuid,
  p_tenant_id uuid,
  p_inspection_id uuid,
  p_image_id uuid,
  p_ai_run_id uuid,
  p_analysis jsonb,
  p_items jsonb,
  p_needs_review boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE job_row public.van_damage_jobs%ROWTYPE;
DECLARE item jsonb;
DECLARE analysis_status text;
BEGIN
  SELECT * INTO job_row FROM public.van_damage_jobs
  WHERE id = p_job_id AND tenant_id = p_tenant_id AND inspection_id = p_inspection_id
    AND image_id = p_image_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Image job scope mismatch'; END IF;
  analysis_status := CASE WHEN p_needs_review THEN 'needs_review' ELSE 'completed' END;

  DELETE FROM public.van_damage_items
  WHERE tenant_id = p_tenant_id AND inspection_id = p_inspection_id AND image_id = p_image_id;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) LOOP
    INSERT INTO public.van_damage_items (
      tenant_id,business_id,inspection_id,image_id,damage_type,vehicle_area,severity,
      confidence,description,repair_recommendation,estimated_cost_min,
      estimated_cost_max,bounding_box,metadata
    ) VALUES (
      job_row.tenant_id,job_row.business_id,p_inspection_id,p_image_id,
      item ->> 'damageType',item ->> 'vehicleArea',item ->> 'severity',
      NULLIF(item ->> 'confidence','')::numeric,item ->> 'description',
      item ->> 'repairRecommendation',NULLIF(item ->> 'estimatedCostMin','')::numeric,
      NULLIF(item ->> 'estimatedCostMax','')::numeric,
      NULLIF(item -> 'boundingBox','null'::jsonb),
      COALESCE(item -> 'metadata','{}'::jsonb) || jsonb_build_object('sourceImageId',p_image_id)
    );
  END LOOP;

  UPDATE public.van_damage_ai_runs
  SET status = CASE WHEN p_needs_review THEN 'needs_review' ELSE 'completed' END,
      parsed_response = COALESCE(p_analysis,'{}'),completed_at = now()
  WHERE id = p_ai_run_id AND tenant_id = p_tenant_id
    AND inspection_id = p_inspection_id AND image_id = p_image_id;

  UPDATE public.van_damage_image_analyses
  SET ai_run_id = p_ai_run_id,status = analysis_status,
      valid_confidence = NULLIF(p_analysis ->> 'overallConfidence','')::numeric,
      damage_count = jsonb_array_length(COALESCE(p_items,'[]'::jsonb)),
      summary = p_analysis ->> 'summary',needs_human_review = p_needs_review,
      failure_category = NULL,failure_message = NULL,completed_at = now(),updated_at = now()
  WHERE tenant_id = p_tenant_id AND image_id = p_image_id
    AND analysis_version = job_row.analysis_version;
  UPDATE public.van_damage_images
  SET status = CASE WHEN analysis_status = 'completed' THEN 'analyzed' ELSE analysis_status END,
      updated_at = now()
  WHERE id = p_image_id AND tenant_id = p_tenant_id AND inspection_id = p_inspection_id;
  UPDATE public.van_damage_jobs
  SET status = 'completed',completed_at = now(),last_error = NULL,failure_category = NULL,updated_at = now()
  WHERE id = p_job_id;
  RETURN public.recalculate_van_damage_inspection_analysis(p_tenant_id,p_inspection_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_van_damage_image_job(
  p_job_id uuid,
  p_tenant_id uuid,
  p_inspection_id uuid,
  p_image_id uuid,
  p_failure_category text,
  p_failure_message text,
  p_terminal boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE job_row public.van_damage_jobs%ROWTYPE;
DECLARE target_status text;
BEGIN
  SELECT * INTO job_row FROM public.van_damage_jobs
  WHERE id = p_job_id AND tenant_id = p_tenant_id AND inspection_id = p_inspection_id
    AND image_id = p_image_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Image job scope mismatch'; END IF;
  target_status := CASE WHEN p_terminal THEN 'failed' ELSE 'queued' END;
  UPDATE public.van_damage_image_analyses
  SET status = target_status,failure_category = p_failure_category,
      failure_message = left(p_failure_message,500),completed_at = CASE WHEN p_terminal THEN now() ELSE NULL END,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND image_id = p_image_id
    AND analysis_version = job_row.analysis_version;
  UPDATE public.van_damage_images SET status = target_status,updated_at = now()
  WHERE id = p_image_id AND tenant_id = p_tenant_id AND inspection_id = p_inspection_id;
  UPDATE public.van_damage_jobs
  SET status = target_status,last_error = left(p_failure_message,500),
      failure_category = p_failure_category,completed_at = CASE WHEN p_terminal THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_job_id;
  RETURN public.recalculate_van_damage_inspection_analysis(p_tenant_id,p_inspection_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_van_damage_slack_event_v2(
  p_integration_id uuid,p_slack_event_id text,p_slack_event_type text,
  p_slack_channel_id text,p_slack_user_id text,p_raw_event jsonb,
  p_slack_message_ts text,p_slack_thread_ts text,p_title text,p_files jsonb,
  p_driver_profile jsonb DEFAULT '{}'::jsonb,p_upload_source_key text DEFAULT NULL,
  p_analysis_version text DEFAULT 'van-damage-v2'
) RETURNS TABLE (
  event_row_id uuid,inspection_row_id uuid,job_row_id uuid,image_row_id uuid,
  slack_file_id text,upload_session_row_id uuid,was_created boolean,
  existing_sqs_message_id text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base_row record;
DECLARE image_row public.van_damage_images%ROWTYPE;
DECLARE job_row public.van_damage_jobs%ROWTYPE;
BEGIN
  SELECT * INTO base_row FROM public.ingest_van_damage_slack_event(
    p_integration_id,p_slack_event_id,p_slack_event_type,p_slack_channel_id,
    p_slack_user_id,p_raw_event,p_slack_message_ts,p_slack_thread_ts,p_title,
    p_files,p_driver_profile,p_upload_source_key
  );
  IF base_row.inspection_row_id IS NULL THEN RETURN; END IF;

  -- Remove only an unqueued legacy inspection-wide job. Existing queued legacy
  -- work is left untouched and recovery tooling can migrate it explicitly.
  DELETE FROM public.van_damage_jobs
  WHERE id = base_row.job_row_id AND image_id IS NULL AND sqs_message_id IS NULL;

  FOR image_row IN
    SELECT * FROM public.van_damage_images
    WHERE tenant_id = (SELECT tenant_id FROM public.van_damage_inspections WHERE id = base_row.inspection_row_id)
      AND inspection_id = base_row.inspection_row_id
    ORDER BY COALESCE(upload_order,original_file_index,2147483647),created_at,id
  LOOP
    SELECT j.* INTO job_row
    FROM public.van_damage_image_analyses a
    JOIN public.van_damage_jobs j ON j.id = a.job_id
    WHERE a.image_id = image_row.id
      AND a.analysis_version = p_analysis_version
      AND a.status IN ('completed','needs_review')
    LIMIT 1;
    IF NOT FOUND THEN
      INSERT INTO public.van_damage_jobs (
        tenant_id,business_id,inspection_id,image_id,slack_event_id,job_type,status,
        analysis_version,idempotency_key
      ) SELECT
        i.tenant_id,i.business_id,i.id,image_row.id,p_slack_event_id,'image_analysis','queued',
        p_analysis_version,
        i.tenant_id::text || ':' || image_row.id::text || ':' || p_analysis_version
      FROM public.van_damage_inspections i WHERE i.id = base_row.inspection_row_id
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE
        SET updated_at = van_damage_jobs.updated_at
      RETURNING * INTO job_row;
    END IF;

    INSERT INTO public.van_damage_image_analyses (
      tenant_id,business_id,inspection_id,image_id,job_id,analysis_version,status
    ) VALUES (
      job_row.tenant_id,job_row.business_id,job_row.inspection_id,image_row.id,
      job_row.id,p_analysis_version,
      CASE WHEN job_row.status = 'processing' THEN 'processing'
           WHEN job_row.status = 'completed' THEN 'completed' ELSE 'queued' END
    ) ON CONFLICT (tenant_id,image_id,analysis_version) DO NOTHING;

    event_row_id := base_row.event_row_id;
    inspection_row_id := base_row.inspection_row_id;
    job_row_id := job_row.id;
    image_row_id := image_row.id;
    slack_file_id := image_row.slack_file_id;
    upload_session_row_id := base_row.upload_session_row_id;
    was_created := base_row.was_created;
    existing_sqs_message_id := job_row.sqs_message_id;
    RETURN NEXT;
  END LOOP;
  PERFORM public.recalculate_van_damage_inspection_analysis(
    (SELECT tenant_id FROM public.van_damage_inspections WHERE id = base_row.inspection_row_id),
    base_row.inspection_row_id
  );
END;
$$;

ALTER TABLE public.van_damage_image_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_van_damage_image_analyses
  ON public.van_damage_image_analyses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_read_van_damage_image_analyses
  ON public.van_damage_image_analyses FOR SELECT TO authenticated
  USING (public.van_damage_workflow_is_member(tenant_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.van_damage_image_analyses TO service_role;
GRANT SELECT ON public.van_damage_image_analyses TO authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_van_damage_slack_event_v2(
  uuid,text,text,text,text,jsonb,text,text,text,jsonb,jsonb,text,text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_van_damage_image_job(uuid,uuid,uuid,uuid,uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_van_damage_image_job(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_van_damage_image_job(uuid,uuid,uuid,uuid,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_van_damage_inspection_analysis(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.van_damage_worker_schema_contract()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'version','2026-07-28-v2','businessScope','tenant_id_equals_business_id',
    'claimRpc','tenant_business_inspection_image_scoped',
    'jobIdentity','tenant_inspection_image_analysis_version',
    'tables',jsonb_build_array(
      'van_slack_integrations','van_damage_jobs','van_damage_inspections',
      'van_damage_images','van_damage_image_analyses','van_damage_ai_runs','van_damage_items'
    )
  )
$$;

NOTIFY pgrst, 'reload schema';
