-- NexoraNow / ApexCRM — Van Damage AI Phase 2
-- Slack OAuth + event ingestion + SQS job tracking + worker persistence.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- The current ApexCRM data model treats one tenant as one business.  Keep the
-- requested business_id on every Van Damage row, but enforce that it is the
-- same UUID as tenant_id so a future caller cannot cross business boundaries.

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS van_number text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS make text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS year integer;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS color text;

CREATE TABLE IF NOT EXISTS public.van_slack_integrations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slack_team_id       text NOT NULL,
  slack_team_name     text,
  slack_bot_user_id   text,
  slack_app_id        text,
  encrypted_bot_token jsonb NOT NULL,
  token_last4         text,
  scopes              text[] NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'connected'
                      CHECK (status IN ('connected', 'disconnected', 'error')),
  connected_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  connected_at        timestamptz NOT NULL DEFAULT now(),
  last_tested_at      timestamptz,
  last_event_at       timestamptz,
  last_error          text,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_slack_integrations_business_scope CHECK (business_id = tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS van_slack_integrations_active_business_uidx
  ON public.van_slack_integrations (tenant_id, business_id)
  WHERE deleted_at IS NULL AND status = 'connected';
CREATE UNIQUE INDEX IF NOT EXISTS van_slack_integrations_active_team_uidx
  ON public.van_slack_integrations (slack_team_id)
  WHERE deleted_at IS NULL AND status = 'connected';
CREATE UNIQUE INDEX IF NOT EXISTS van_slack_integrations_active_scope_team_uidx
  ON public.van_slack_integrations (tenant_id, business_id, slack_team_id)
  WHERE deleted_at IS NULL AND status = 'connected';
CREATE INDEX IF NOT EXISTS van_slack_integrations_tenant_idx ON public.van_slack_integrations (tenant_id);
CREATE INDEX IF NOT EXISTS van_slack_integrations_business_idx ON public.van_slack_integrations (business_id);
CREATE INDEX IF NOT EXISTS van_slack_integrations_team_idx ON public.van_slack_integrations (slack_team_id);
CREATE INDEX IF NOT EXISTS van_slack_integrations_status_idx ON public.van_slack_integrations (status);

CREATE TABLE IF NOT EXISTS public.van_slack_channels (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id     uuid NOT NULL REFERENCES public.van_slack_integrations(id) ON DELETE CASCADE,
  slack_channel_id   text NOT NULL,
  slack_channel_name text,
  channel_type       text,
  is_enabled         boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_slack_channels_business_scope CHECK (business_id = tenant_id),
  CONSTRAINT van_slack_channels_integration_channel_unique UNIQUE (integration_id, slack_channel_id)
);
CREATE INDEX IF NOT EXISTS van_slack_channels_scope_idx
  ON public.van_slack_channels (tenant_id, business_id, integration_id, is_enabled);

CREATE TABLE IF NOT EXISTS public.van_damage_slack_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id   uuid REFERENCES public.van_slack_integrations(id) ON DELETE SET NULL,
  tenant_id        uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id      uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  slack_team_id    text NOT NULL,
  slack_event_id   text NOT NULL UNIQUE,
  slack_event_type text,
  slack_channel_id text,
  slack_user_id    text,
  raw_event        jsonb NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'received',
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_slack_events_business_scope
    CHECK (business_id IS NULL OR (tenant_id IS NOT NULL AND business_id = tenant_id))
);
CREATE INDEX IF NOT EXISTS van_damage_slack_events_scope_idx ON public.van_damage_slack_events (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS van_damage_slack_events_team_idx ON public.van_damage_slack_events (slack_team_id);
CREATE INDEX IF NOT EXISTS van_damage_slack_events_created_idx ON public.van_damage_slack_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.van_damage_inspections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  van_id            uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  source            text NOT NULL DEFAULT 'slack',
  slack_team_id     text,
  slack_channel_id  text,
  slack_message_ts  text,
  slack_thread_ts   text,
  slack_user_id     text,
  title             text,
  status            text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'processing', 'analyzing', 'completed', 'failed', 'needs_review')),
  image_count       integer NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  damage_count      integer NOT NULL DEFAULT 0 CHECK (damage_count >= 0),
  ai_summary        text,
  ai_confidence     numeric CHECK (ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1),
  ai_model          text,
  review_status     text NOT NULL DEFAULT 'pending'
                    CHECK (review_status IN ('pending', 'in_review', 'reviewed', 'dismissed')),
  reviewed_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  error_message     text,
  metadata          jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  CONSTRAINT van_damage_inspections_business_scope CHECK (business_id = tenant_id)
);
CREATE INDEX IF NOT EXISTS van_damage_inspections_tenant_idx ON public.van_damage_inspections (tenant_id);
CREATE INDEX IF NOT EXISTS van_damage_inspections_business_idx ON public.van_damage_inspections (business_id);
CREATE INDEX IF NOT EXISTS van_damage_inspections_van_idx ON public.van_damage_inspections (van_id);
CREATE INDEX IF NOT EXISTS van_damage_inspections_status_idx ON public.van_damage_inspections (status);
CREATE INDEX IF NOT EXISTS van_damage_inspections_created_idx ON public.van_damage_inspections (created_at DESC);
CREATE INDEX IF NOT EXISTS van_damage_inspections_slack_message_idx ON public.van_damage_inspections (slack_message_ts);
CREATE UNIQUE INDEX IF NOT EXISTS van_damage_inspections_slack_message_uidx
  ON public.van_damage_inspections (tenant_id, slack_team_id, slack_channel_id, slack_message_ts)
  WHERE source = 'slack' AND slack_message_ts IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.van_damage_images (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inspection_id      uuid NOT NULL REFERENCES public.van_damage_inspections(id) ON DELETE CASCADE,
  slack_file_id      text,
  slack_file_url     text,
  s3_bucket          text,
  s3_key             text,
  s3_etag            text,
  content_type       text,
  file_size_bytes    bigint CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  width              integer CHECK (width IS NULL OR width >= 0),
  height             integer CHECK (height IS NULL OR height >= 0),
  image_role         text CHECK (image_role IS NULL OR image_role IN (
                       'front', 'rear', 'driver_side', 'passenger_side', 'interior',
                       'odometer', 'damage_closeup', 'unknown'
                     )),
  status             text NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued', 'downloading', 'uploaded', 'analyzed', 'failed')),
  metadata           jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_images_business_scope CHECK (business_id = tenant_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS van_damage_images_slack_file_uidx
  ON public.van_damage_images (tenant_id, slack_file_id) WHERE slack_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS van_damage_images_inspection_idx ON public.van_damage_images (inspection_id);
CREATE INDEX IF NOT EXISTS van_damage_images_tenant_idx ON public.van_damage_images (tenant_id);
CREATE INDEX IF NOT EXISTS van_damage_images_business_idx ON public.van_damage_images (business_id);
CREATE INDEX IF NOT EXISTS van_damage_images_status_idx ON public.van_damage_images (status);

CREATE OR REPLACE FUNCTION public.van_damage_valid_bounding_box(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  x numeric;
  y numeric;
  w numeric;
  h numeric;
BEGIN
  IF value IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(value) <> 'object' THEN RETURN false; END IF;
  x := (value ->> 'x')::numeric;
  y := (value ->> 'y')::numeric;
  w := (value ->> 'width')::numeric;
  h := (value ->> 'height')::numeric;
  RETURN x BETWEEN 0 AND 1 AND y BETWEEN 0 AND 1
    AND w BETWEEN 0 AND 1 AND h BETWEEN 0 AND 1
    AND x + w <= 1 AND y + h <= 1;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE TABLE IF NOT EXISTS public.van_damage_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inspection_id         uuid NOT NULL REFERENCES public.van_damage_inspections(id) ON DELETE CASCADE,
  image_id              uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  damage_type           text CHECK (damage_type IS NULL OR damage_type IN (
                            'dent', 'scratch', 'crack', 'broken_light', 'broken_mirror',
                            'paint_damage', 'bumper_damage', 'glass_damage',
                            'tire_wheel_damage', 'interior_damage', 'unknown'
                          )),
  vehicle_area          text CHECK (vehicle_area IS NULL OR vehicle_area IN (
                            'front_bumper', 'rear_bumper', 'driver_side', 'passenger_side',
                            'roof', 'hood', 'door', 'mirror', 'wheel', 'interior', 'unknown'
                          )),
  severity              text CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical', 'unknown')),
  confidence            numeric CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  description           text,
  repair_recommendation text,
  estimated_cost_min    numeric CHECK (estimated_cost_min IS NULL OR estimated_cost_min >= 0),
  estimated_cost_max    numeric CHECK (estimated_cost_max IS NULL OR estimated_cost_max >= 0),
  bounding_box          jsonb CHECK (public.van_damage_valid_bounding_box(bounding_box)),
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_items_business_scope CHECK (business_id = tenant_id),
  CONSTRAINT van_damage_items_cost_range CHECK (
    estimated_cost_min IS NULL OR estimated_cost_max IS NULL OR estimated_cost_min <= estimated_cost_max
  )
);
CREATE INDEX IF NOT EXISTS van_damage_items_tenant_idx ON public.van_damage_items (tenant_id);
CREATE INDEX IF NOT EXISTS van_damage_items_business_idx ON public.van_damage_items (business_id);
CREATE INDEX IF NOT EXISTS van_damage_items_inspection_idx ON public.van_damage_items (inspection_id);
CREATE INDEX IF NOT EXISTS van_damage_items_image_idx ON public.van_damage_items (image_id);
CREATE INDEX IF NOT EXISTS van_damage_items_severity_idx ON public.van_damage_items (severity);

CREATE TABLE IF NOT EXISTS public.van_damage_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inspection_id    uuid REFERENCES public.van_damage_inspections(id) ON DELETE CASCADE,
  slack_event_id   text,
  sqs_message_id   text,
  job_type         text NOT NULL DEFAULT 'slack_inspection',
  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'dead_lettered')),
  attempt_count    integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error       text,
  payload          jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  CONSTRAINT van_damage_jobs_business_scope CHECK (business_id = tenant_id)
);
CREATE INDEX IF NOT EXISTS van_damage_jobs_tenant_idx ON public.van_damage_jobs (tenant_id);
CREATE INDEX IF NOT EXISTS van_damage_jobs_business_idx ON public.van_damage_jobs (business_id);
CREATE INDEX IF NOT EXISTS van_damage_jobs_inspection_idx ON public.van_damage_jobs (inspection_id);
CREATE INDEX IF NOT EXISTS van_damage_jobs_event_idx ON public.van_damage_jobs (slack_event_id);
CREATE INDEX IF NOT EXISTS van_damage_jobs_status_idx ON public.van_damage_jobs (status);
CREATE INDEX IF NOT EXISTS van_damage_jobs_created_idx ON public.van_damage_jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.van_damage_ai_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inspection_id   uuid NOT NULL REFERENCES public.van_damage_inspections(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'gemini',
  model           text,
  status          text NOT NULL DEFAULT 'started'
                  CHECK (status IN ('started', 'completed', 'failed', 'needs_review')),
  prompt_version  text,
  input_summary   jsonb NOT NULL DEFAULT '{}',
  raw_response    jsonb NOT NULL DEFAULT '{}',
  parsed_response jsonb NOT NULL DEFAULT '{}',
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  CONSTRAINT van_damage_ai_runs_business_scope CHECK (business_id = tenant_id)
);
CREATE INDEX IF NOT EXISTS van_damage_ai_runs_scope_idx ON public.van_damage_ai_runs (tenant_id, business_id);
CREATE INDEX IF NOT EXISTS van_damage_ai_runs_inspection_idx ON public.van_damage_ai_runs (inspection_id, created_at DESC);

-- Reuse the repository's canonical updated_at helper.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'van_slack_integrations', 'van_slack_channels', 'van_damage_inspections',
    'van_damage_images', 'van_damage_items', 'van_damage_jobs'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      table_name, table_name
    );
  END LOOP;
END $$;

-- Atomic event ingest.  Duplicate event IDs return the original rows so the
-- caller can safely retry an SQS send that failed after database persistence.
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
  p_files jsonb
) RETURNS TABLE (
  event_row_id uuid,
  inspection_row_id uuid,
  job_row_id uuid,
  was_created boolean,
  existing_sqs_message_id text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  integration_row public.van_slack_integrations%ROWTYPE;
  existing_event public.van_damage_slack_events%ROWTYPE;
  inspection_uuid uuid;
  job_uuid uuid;
  file_record jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_slack_event_id, 0));
  SELECT * INTO integration_row
  FROM public.van_slack_integrations
  WHERE id = p_integration_id AND status = 'connected' AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Slack integration is not connected'; END IF;

  SELECT * INTO existing_event
  FROM public.van_damage_slack_events
  WHERE slack_event_id = p_slack_event_id;
  IF FOUND THEN
    SELECT j.id, j.inspection_id, j.sqs_message_id
      INTO job_uuid, inspection_uuid, existing_sqs_message_id
    FROM public.van_damage_jobs j
    WHERE j.slack_event_id = p_slack_event_id
    ORDER BY j.created_at ASC LIMIT 1;
    event_row_id := existing_event.id;
    inspection_row_id := inspection_uuid;
    job_row_id := job_uuid;
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
    slack_message_ts, slack_thread_ts, slack_user_id, title, status, metadata
  ) VALUES (
    integration_row.tenant_id, integration_row.business_id, 'slack', integration_row.slack_team_id,
    p_slack_channel_id, p_slack_message_ts, p_slack_thread_ts, p_slack_user_id,
    p_title, 'queued', jsonb_build_object('slackEventId', p_slack_event_id)
  ) RETURNING id INTO inspection_uuid;

  FOR file_record IN SELECT value FROM jsonb_array_elements(COALESCE(p_files, '[]'::jsonb)) LOOP
    INSERT INTO public.van_damage_images (
      tenant_id, business_id, inspection_id, slack_file_id, slack_file_url,
      content_type, file_size_bytes, width, height, image_role, status, metadata
    ) VALUES (
      integration_row.tenant_id, integration_row.business_id, inspection_uuid,
      file_record ->> 'id', file_record ->> 'url', file_record ->> 'mimetype',
      NULLIF(file_record ->> 'size', '')::bigint,
      NULLIF(file_record ->> 'width', '')::integer,
      NULLIF(file_record ->> 'height', '')::integer,
      'unknown', 'queued',
      jsonb_build_object('name', file_record ->> 'name', 'fileAccess', file_record ->> 'fileAccess')
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.van_damage_inspections
  SET image_count = (SELECT count(*) FROM public.van_damage_images WHERE inspection_id = inspection_uuid)
  WHERE id = inspection_uuid;

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
  was_created := true;
  existing_sqs_message_id := NULL;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_van_damage_job(p_job_id uuid, p_stale_before timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_job public.van_damage_jobs%ROWTYPE;
BEGIN
  SELECT * INTO current_job FROM public.van_damage_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF current_job.status = 'completed' THEN RETURN 'completed'; END IF;
  IF current_job.status = 'processing' AND current_job.updated_at >= p_stale_before THEN RETURN 'busy'; END IF;
  UPDATE public.van_damage_jobs
  SET status = 'processing', attempt_count = attempt_count + 1,
      started_at = COALESCE(started_at, now()), last_error = NULL
  WHERE id = p_job_id;
  UPDATE public.van_damage_inspections SET status = 'processing', error_message = NULL
  WHERE id = current_job.inspection_id;
  RETURN 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_van_damage_job(
  p_job_id uuid,
  p_inspection_id uuid,
  p_ai_run_id uuid,
  p_analysis jsonb,
  p_items jsonb,
  p_needs_review boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  job_row public.van_damage_jobs%ROWTYPE;
  item jsonb;
BEGIN
  SELECT * INTO job_row FROM public.van_damage_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR job_row.inspection_id <> p_inspection_id THEN RAISE EXCEPTION 'Job scope mismatch'; END IF;

  DELETE FROM public.van_damage_items WHERE inspection_id = p_inspection_id;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    INSERT INTO public.van_damage_items (
      tenant_id, business_id, inspection_id, image_id, damage_type, vehicle_area,
      severity, confidence, description, repair_recommendation,
      estimated_cost_min, estimated_cost_max, bounding_box, metadata
    ) VALUES (
      job_row.tenant_id, job_row.business_id, p_inspection_id,
      NULLIF(item ->> 'imageId', '')::uuid, item ->> 'damageType', item ->> 'vehicleArea',
      item ->> 'severity', NULLIF(item ->> 'confidence', '')::numeric,
      item ->> 'description', item ->> 'repairRecommendation',
      NULLIF(item ->> 'estimatedCostMin', '')::numeric,
      NULLIF(item ->> 'estimatedCostMax', '')::numeric,
      NULLIF(item -> 'boundingBox', 'null'::jsonb), COALESCE(item -> 'metadata', '{}'::jsonb)
    );
  END LOOP;

  UPDATE public.van_damage_ai_runs
  SET status = CASE WHEN p_needs_review THEN 'needs_review' ELSE 'completed' END,
      parsed_response = COALESCE(p_analysis, '{}'), completed_at = now()
  WHERE id = p_ai_run_id AND inspection_id = p_inspection_id
    AND tenant_id = job_row.tenant_id AND business_id = job_row.business_id;

  UPDATE public.van_damage_inspections
  SET status = CASE WHEN p_needs_review THEN 'needs_review' ELSE 'completed' END,
      ai_summary = p_analysis ->> 'summary',
      ai_confidence = NULLIF(p_analysis ->> 'overallConfidence', '')::numeric,
      damage_count = jsonb_array_length(COALESCE(p_items, '[]'::jsonb)),
      completed_at = now(), error_message = NULL
  WHERE id = p_inspection_id AND tenant_id = job_row.tenant_id AND business_id = job_row.business_id;

  UPDATE public.van_damage_images SET status = 'analyzed' WHERE inspection_id = p_inspection_id;
  UPDATE public.van_damage_jobs SET status = 'completed', completed_at = now(), last_error = NULL
  WHERE id = p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_van_slack_integration(
  p_tenant_id uuid,
  p_business_id uuid,
  p_slack_team_id text,
  p_slack_team_name text,
  p_slack_bot_user_id text,
  p_slack_app_id text,
  p_encrypted_bot_token jsonb,
  p_token_last4 text,
  p_scopes text[],
  p_connected_by uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  conflicting_business uuid;
  target_id uuid;
BEGIN
  IF p_business_id <> p_tenant_id THEN RAISE EXCEPTION 'Business scope mismatch'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_slack_team_id, 1));

  SELECT business_id INTO conflicting_business
  FROM public.van_slack_integrations
  WHERE slack_team_id = p_slack_team_id AND status = 'connected' AND deleted_at IS NULL
    AND business_id <> p_business_id
  LIMIT 1;
  IF conflicting_business IS NOT NULL THEN RAISE EXCEPTION 'Slack workspace is already connected to another business'; END IF;

  SELECT id INTO target_id
  FROM public.van_slack_integrations
  WHERE tenant_id = p_tenant_id AND business_id = p_business_id AND slack_team_id = p_slack_team_id
  ORDER BY created_at DESC LIMIT 1;

  UPDATE public.van_slack_integrations
  SET status = 'disconnected'
  WHERE tenant_id = p_tenant_id AND business_id = p_business_id
    AND status = 'connected' AND deleted_at IS NULL
    AND (target_id IS NULL OR id <> target_id);

  IF target_id IS NULL THEN
    INSERT INTO public.van_slack_integrations (
      tenant_id, business_id, slack_team_id, slack_team_name, slack_bot_user_id,
      slack_app_id, encrypted_bot_token, token_last4, scopes, status,
      connected_by, connected_at, last_error, deleted_at
    ) VALUES (
      p_tenant_id, p_business_id, p_slack_team_id, p_slack_team_name, p_slack_bot_user_id,
      p_slack_app_id, p_encrypted_bot_token, p_token_last4, COALESCE(p_scopes, '{}'), 'connected',
      p_connected_by, now(), NULL, NULL
    ) RETURNING id INTO target_id;
  ELSE
    UPDATE public.van_slack_integrations SET
      slack_team_name = p_slack_team_name,
      slack_bot_user_id = p_slack_bot_user_id,
      slack_app_id = p_slack_app_id,
      encrypted_bot_token = p_encrypted_bot_token,
      token_last4 = p_token_last4,
      scopes = COALESCE(p_scopes, '{}'),
      status = 'connected',
      connected_by = p_connected_by,
      connected_at = now(),
      last_error = NULL,
      deleted_at = NULL
    WHERE id = target_id;
  END IF;
  RETURN target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_van_damage_slack_event(uuid,text,text,text,text,jsonb,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_van_damage_job(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_van_damage_job(uuid,uuid,uuid,jsonb,jsonb,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_van_slack_integration(uuid,uuid,text,text,text,text,jsonb,text,text[],uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_van_damage_slack_event(uuid,text,text,text,text,jsonb,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_van_damage_job(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_van_damage_job(uuid,uuid,uuid,jsonb,jsonb,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_van_slack_integration(uuid,uuid,text,text,text,text,jsonb,text,text[],uuid) TO service_role;

-- RLS: no direct browser access to secrets/audit/job/raw AI tables. Operational
-- result tables are read-only for active members of their own tenant.
ALTER TABLE public.van_slack_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.van_slack_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.van_damage_slack_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.van_damage_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.van_damage_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.van_damage_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.van_damage_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.van_damage_ai_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'van_slack_integrations', 'van_slack_channels', 'van_damage_slack_events',
    'van_damage_inspections', 'van_damage_images', 'van_damage_items',
    'van_damage_jobs', 'van_damage_ai_runs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all_%I ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY service_role_all_%I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      table_name, table_name
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS tenant_read_van_damage_inspections ON public.van_damage_inspections;
DROP POLICY IF EXISTS tenant_read_van_damage_images ON public.van_damage_images;
DROP POLICY IF EXISTS tenant_read_van_damage_items ON public.van_damage_items;

CREATE POLICY tenant_read_van_damage_inspections ON public.van_damage_inspections
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
      AND (u.role = 'owner' OR u.tenant_id = van_damage_inspections.tenant_id)
  ));
CREATE POLICY tenant_read_van_damage_images ON public.van_damage_images
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
      AND (u.role = 'owner' OR u.tenant_id = van_damage_images.tenant_id)
  ));
CREATE POLICY tenant_read_van_damage_items ON public.van_damage_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
      AND (u.role = 'owner' OR u.tenant_id = van_damage_items.tenant_id)
  ));
