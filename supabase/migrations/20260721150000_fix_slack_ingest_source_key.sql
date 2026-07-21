-- Fix the Phase 3D Slack ingestion function's ambiguous source_key reference.
-- Also deduplicate by the stable Slack message source key so a recovered message
-- and a later Slack retry cannot create two inspections for the same upload.

CREATE OR REPLACE FUNCTION public.ingest_van_damage_slack_event(
  p_integration_id uuid,
  p_slack_event_id text,
  p_slack_event_type text,
  p_slack_channel_id text,
  p_slack_user_id text,
  p_raw_event jsonb,
  p_slack_message_ts text,
  p_slack_thread_ts text,
  p_title text,
  p_files jsonb,
  p_driver_profile jsonb DEFAULT '{}'::jsonb,
  p_upload_source_key text DEFAULT NULL
) RETURNS TABLE (
  event_row_id uuid,
  inspection_row_id uuid,
  job_row_id uuid,
  upload_session_row_id uuid,
  was_created boolean,
  existing_sqs_message_id text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  integration_row public.van_slack_integrations%ROWTYPE;
  existing_event public.van_damage_slack_events%ROWTYPE;
  existing_session public.van_damage_upload_sessions%ROWTYPE;
  inspection_uuid uuid;
  job_uuid uuid;
  session_uuid uuid;
  file_record jsonb;
  resolved_source_key text;
  upload_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_slack_event_id, 0));
  SELECT * INTO integration_row
  FROM public.van_slack_integrations
  WHERE id = p_integration_id AND status = 'connected' AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Slack integration is not connected'; END IF;

  resolved_source_key := COALESCE(
    p_upload_source_key,
    integration_row.tenant_id::text || ':' || integration_row.slack_team_id || ':' || p_slack_channel_id || ':' || p_slack_message_ts
  );
  upload_at := COALESCE(public.van_damage_slack_ts_to_timestamptz(p_slack_message_ts), now());

  SELECT slack_event.* INTO existing_event
  FROM public.van_damage_slack_events AS slack_event
  WHERE slack_event.slack_event_id = p_slack_event_id;
  IF FOUND THEN
    SELECT job.id, job.inspection_id, job.sqs_message_id
      INTO job_uuid, inspection_uuid, existing_sqs_message_id
    FROM public.van_damage_jobs AS job
    WHERE job.slack_event_id = p_slack_event_id
    ORDER BY job.created_at ASC LIMIT 1;
    SELECT upload.id INTO session_uuid
    FROM public.van_damage_upload_sessions AS upload
    WHERE upload.tenant_id = existing_event.tenant_id
      AND upload.source_key = resolved_source_key
    LIMIT 1;
    event_row_id := existing_event.id;
    inspection_row_id := inspection_uuid;
    job_row_id := job_uuid;
    upload_session_row_id := session_uuid;
    was_created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Slack may retry with a different event ID, and recovery tooling may ingest a
  -- message before Slack retries it. The workspace/channel/message key is the
  -- durable upload identity in both cases.
  SELECT upload.* INTO existing_session
  FROM public.van_damage_upload_sessions AS upload
  WHERE upload.tenant_id = integration_row.tenant_id
    AND upload.source_key = resolved_source_key
  LIMIT 1;
  IF FOUND THEN
    SELECT job.id, job.sqs_message_id
      INTO job_uuid, existing_sqs_message_id
    FROM public.van_damage_jobs AS job
    WHERE job.inspection_id = existing_session.inspection_id
    ORDER BY job.created_at ASC LIMIT 1;

    INSERT INTO public.van_damage_slack_events (
      integration_id, tenant_id, business_id, slack_team_id, slack_event_id,
      slack_event_type, slack_channel_id, slack_user_id, raw_event, status
    ) VALUES (
      integration_row.id, integration_row.tenant_id, integration_row.business_id,
      integration_row.slack_team_id, p_slack_event_id, p_slack_event_type,
      p_slack_channel_id, p_slack_user_id, COALESCE(p_raw_event, '{}'), 'duplicate_source'
    )
    ON CONFLICT (slack_event_id) DO UPDATE SET
      status = 'duplicate_source',
      error_message = NULL
    RETURNING id INTO event_row_id;

    inspection_row_id := existing_session.inspection_id;
    job_row_id := job_uuid;
    upload_session_row_id := existing_session.id;
    was_created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.van_damage_slack_events (
    integration_id, tenant_id, business_id, slack_team_id, slack_event_id,
    slack_event_type, slack_channel_id, slack_user_id, raw_event, status
  ) VALUES (
    integration_row.id, integration_row.tenant_id, integration_row.business_id,
    integration_row.slack_team_id, p_slack_event_id, p_slack_event_type,
    p_slack_channel_id, p_slack_user_id, COALESCE(p_raw_event, '{}'), 'received'
  ) RETURNING id INTO event_row_id;

  INSERT INTO public.van_damage_inspections (
    tenant_id, business_id, source, slack_team_id, slack_channel_id,
    slack_message_ts, slack_thread_ts, slack_user_id, title, status,
    upload_source_key, slack_upload_at, driver_snapshot, metadata
  ) VALUES (
    integration_row.tenant_id, integration_row.business_id, 'slack', integration_row.slack_team_id,
    p_slack_channel_id, p_slack_message_ts, p_slack_thread_ts, p_slack_user_id,
    p_title, 'queued', resolved_source_key, upload_at, COALESCE(p_driver_profile, '{}'),
    jsonb_build_object('slackEventId', p_slack_event_id, 'driver', COALESCE(p_driver_profile, '{}'))
  ) RETURNING id INTO inspection_uuid;

  INSERT INTO public.van_damage_upload_sessions (
    tenant_id, business_id, inspection_id, integration_id, source_key, slack_team_id,
    slack_channel_id, slack_user_id, slack_message_ts, slack_thread_ts, original_text,
    driver_snapshot, upload_started_at, status, review_status
  ) VALUES (
    integration_row.tenant_id, integration_row.business_id, inspection_uuid, integration_row.id,
    resolved_source_key, integration_row.slack_team_id, p_slack_channel_id, p_slack_user_id,
    p_slack_message_ts, p_slack_thread_ts, p_title, COALESCE(p_driver_profile, '{}'),
    upload_at, 'queued', 'pending'
  ) ON CONFLICT (tenant_id, source_key) DO UPDATE SET
    driver_snapshot = COALESCE(NULLIF(EXCLUDED.driver_snapshot, '{}'::jsonb), van_damage_upload_sessions.driver_snapshot),
    updated_at = now()
  RETURNING id INTO session_uuid;

  FOR file_record IN
    SELECT file_value || jsonb_build_object('ordinality', file_ordinality - 1)
    FROM jsonb_array_elements(COALESCE(p_files, '[]'::jsonb))
      WITH ORDINALITY AS files(file_value, file_ordinality)
  LOOP
    INSERT INTO public.van_damage_images (
      tenant_id, business_id, inspection_id, upload_session_id, slack_file_id, slack_file_url,
      content_type, file_size_bytes, width, height, image_role, status, upload_order,
      original_file_index, slack_file_created_at, metadata
    ) VALUES (
      integration_row.tenant_id, integration_row.business_id, inspection_uuid, session_uuid,
      file_record ->> 'id', file_record ->> 'url', file_record ->> 'mimetype',
      NULLIF(file_record ->> 'size', '')::bigint,
      NULLIF(file_record ->> 'width', '')::integer,
      NULLIF(file_record ->> 'height', '')::integer,
      'unknown', 'queued', NULLIF(file_record ->> 'ordinality', '')::integer,
      NULLIF(file_record ->> 'ordinality', '')::integer,
      public.van_damage_slack_ts_to_timestamptz(file_record ->> 'created'),
      jsonb_build_object('name', file_record ->> 'name', 'fileAccess', file_record ->> 'fileAccess')
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.van_damage_inspections
  SET image_count = (SELECT count(*) FROM public.van_damage_images WHERE inspection_id = inspection_uuid),
      upload_session_id = session_uuid
  WHERE id = inspection_uuid;

  UPDATE public.van_damage_upload_sessions
  SET image_count = (SELECT count(*) FROM public.van_damage_images WHERE upload_session_id = session_uuid),
      first_image_id = (
        SELECT image.id FROM public.van_damage_images AS image
        WHERE image.upload_session_id = session_uuid
        ORDER BY COALESCE(image.upload_order, image.original_file_index, 2147483647), image.created_at, image.id
        LIMIT 1
      )
  WHERE id = session_uuid;

  INSERT INTO public.van_damage_jobs (
    tenant_id, business_id, inspection_id, slack_event_id, job_type, status
  ) VALUES (
    integration_row.tenant_id, integration_row.business_id, inspection_uuid,
    p_slack_event_id, 'slack_inspection', 'queued'
  ) RETURNING id INTO job_uuid;

  UPDATE public.van_damage_slack_events SET status = 'queued' WHERE id = event_row_id;
  UPDATE public.van_slack_integrations SET last_event_at = now(), last_error = NULL WHERE id = integration_row.id;

  inspection_row_id := inspection_uuid;
  job_row_id := job_uuid;
  upload_session_row_id := session_uuid;
  was_created := true;
  existing_sqs_message_id := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_van_damage_slack_event(uuid,text,text,text,text,jsonb,text,text,text,jsonb,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_van_damage_slack_event(uuid,text,text,text,text,jsonb,text,text,text,jsonb,jsonb,text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
