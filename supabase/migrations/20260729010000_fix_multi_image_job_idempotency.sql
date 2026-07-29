-- Ensure every image in one inspection receives a distinct durable job.
-- The prior function accidentally used inspection_id in the key and therefore
-- collapsed sibling images through ON CONFLICT.

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
    ) ON CONFLICT (tenant_id,image_id,analysis_version) DO UPDATE SET
      job_id = EXCLUDED.job_id,
      status = CASE
        WHEN van_damage_image_analyses.status IN ('completed','needs_review')
          THEN van_damage_image_analyses.status
        ELSE EXCLUDED.status
      END,
      updated_at = now();

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

GRANT EXECUTE ON FUNCTION public.ingest_van_damage_slack_event_v2(
  uuid,text,text,text,text,jsonb,text,text,text,jsonb,jsonb,text,text
) TO service_role;

NOTIFY pgrst, 'reload schema';
