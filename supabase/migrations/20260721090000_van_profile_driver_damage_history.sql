-- Phase 3D: van profile upload sessions, driver attribution, image ordering,
-- automatic first-image profile references, and duplicate-damage suppression.
-- Additive and backward-compatible with existing inspections and queued jobs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.vehicles SET business_id = tenant_id WHERE business_id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vehicles_business_scope'
      AND conrelid = 'public.vehicles'::regclass
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_business_scope CHECK (business_id IS NULL OR business_id = tenant_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS vehicles_business_idx ON public.vehicles (business_id);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_tenant_van_number_uidx
  ON public.vehicles (tenant_id, van_number) WHERE van_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.van_slack_user_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slack_team_id       text NOT NULL,
  slack_user_id       text NOT NULL,
  display_name        text,
  real_name           text,
  username            text,
  avatar_url          text,
  last_resolved_at    timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_slack_user_profiles_business_scope CHECK (business_id = tenant_id),
  CONSTRAINT van_slack_user_profiles_scope_uidx UNIQUE (tenant_id, slack_team_id, slack_user_id)
);
CREATE INDEX IF NOT EXISTS van_slack_user_profiles_lookup_idx
  ON public.van_slack_user_profiles (tenant_id, business_id, slack_team_id, slack_user_id);

CREATE TABLE IF NOT EXISTS public.van_damage_upload_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  van_id              uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  inspection_id       uuid NOT NULL REFERENCES public.van_damage_inspections(id) ON DELETE CASCADE,
  integration_id      uuid REFERENCES public.van_slack_integrations(id) ON DELETE SET NULL,
  source_key          text NOT NULL,
  slack_team_id       text NOT NULL,
  slack_channel_id    text NOT NULL,
  slack_user_id       text,
  slack_message_ts    text NOT NULL,
  slack_thread_ts     text,
  slack_permalink     text,
  original_text       text,
  driver_snapshot     jsonb NOT NULL DEFAULT '{}',
  upload_started_at   timestamptz NOT NULL DEFAULT now(),
  ingested_at         timestamptz NOT NULL DEFAULT now(),
  first_image_id      uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  image_count         integer NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  status              text NOT NULL DEFAULT 'queued',
  damage_result       text,
  review_status       text NOT NULL DEFAULT 'pending',
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_upload_sessions_business_scope CHECK (business_id = tenant_id),
  CONSTRAINT van_damage_upload_sessions_source_uidx UNIQUE (tenant_id, source_key)
);
CREATE INDEX IF NOT EXISTS van_damage_upload_sessions_van_time_idx
  ON public.van_damage_upload_sessions (tenant_id, business_id, van_id, upload_started_at DESC);
CREATE INDEX IF NOT EXISTS van_damage_upload_sessions_driver_idx
  ON public.van_damage_upload_sessions (tenant_id, business_id, slack_team_id, slack_user_id);
CREATE INDEX IF NOT EXISTS van_damage_upload_sessions_inspection_idx
  ON public.van_damage_upload_sessions (inspection_id);

ALTER TABLE public.van_damage_inspections ADD COLUMN IF NOT EXISTS upload_session_id uuid REFERENCES public.van_damage_upload_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.van_damage_inspections ADD COLUMN IF NOT EXISTS upload_source_key text;
ALTER TABLE public.van_damage_inspections ADD COLUMN IF NOT EXISTS slack_upload_at timestamptz;
ALTER TABLE public.van_damage_inspections ADD COLUMN IF NOT EXISTS driver_snapshot jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS van_damage_inspections_upload_session_idx ON public.van_damage_inspections (upload_session_id);
CREATE INDEX IF NOT EXISTS van_damage_inspections_van_created_idx ON public.van_damage_inspections (tenant_id, business_id, van_id, created_at DESC);

ALTER TABLE public.van_damage_images ADD COLUMN IF NOT EXISTS upload_session_id uuid REFERENCES public.van_damage_upload_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.van_damage_images ADD COLUMN IF NOT EXISTS upload_order integer;
ALTER TABLE public.van_damage_images ADD COLUMN IF NOT EXISTS original_file_index integer;
ALTER TABLE public.van_damage_images ADD COLUMN IF NOT EXISTS slack_file_created_at timestamptz;
CREATE INDEX IF NOT EXISTS van_damage_images_session_order_idx
  ON public.van_damage_images (tenant_id, business_id, upload_session_id, upload_order);

CREATE TABLE IF NOT EXISTS public.van_damage_cases (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id                     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  van_id                          uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  canonical_region                text NOT NULL DEFAULT 'unspecified',
  normalized_damage_type          text NOT NULL DEFAULT 'unknown',
  original_damage_type            text,
  effective_damage_type           text,
  first_detected_inspection_id    uuid REFERENCES public.van_damage_inspections(id) ON DELETE SET NULL,
  latest_observed_inspection_id   uuid REFERENCES public.van_damage_inspections(id) ON DELETE SET NULL,
  first_detected_at               timestamptz NOT NULL DEFAULT now(),
  last_observed_at                timestamptz NOT NULL DEFAULT now(),
  observation_count               integer NOT NULL DEFAULT 0 CHECK (observation_count >= 0),
  first_alert_id                  uuid,
  alert_created_at                timestamptz,
  current_severity                text,
  max_observed_severity           text,
  lifecycle_status                text NOT NULL DEFAULT 'active',
  needs_review                    boolean NOT NULL DEFAULT false,
  repaired_at                     timestamptz,
  resolved_at                     timestamptz,
  recurrence_of_case_id           uuid REFERENCES public.van_damage_cases(id) ON DELETE SET NULL,
  latest_evidence_image_id        uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  duplicate_alert_suppression_count integer NOT NULL DEFAULT 0 CHECK (duplicate_alert_suppression_count >= 0),
  fingerprint                     text NOT NULL,
  metadata                        jsonb NOT NULL DEFAULT '{}',
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_cases_business_scope CHECK (business_id = tenant_id)
);
CREATE INDEX IF NOT EXISTS van_damage_cases_van_status_idx
  ON public.van_damage_cases (tenant_id, business_id, van_id, lifecycle_status, last_observed_at DESC);
CREATE INDEX IF NOT EXISTS van_damage_cases_fingerprint_idx
  ON public.van_damage_cases (tenant_id, business_id, van_id, fingerprint);

CREATE TABLE IF NOT EXISTS public.van_damage_observations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  van_id                uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  damage_case_id        uuid REFERENCES public.van_damage_cases(id) ON DELETE SET NULL,
  inspection_id         uuid NOT NULL REFERENCES public.van_damage_inspections(id) ON DELETE CASCADE,
  item_id               uuid NOT NULL REFERENCES public.van_damage_items(id) ON DELETE CASCADE,
  image_id              uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  upload_session_id     uuid REFERENCES public.van_damage_upload_sessions(id) ON DELETE SET NULL,
  observation_type      text NOT NULL CHECK (observation_type IN ('new_damage','existing_damage_observed','possible_duplicate','recurrent_damage')),
  alert_created         boolean NOT NULL DEFAULT false,
  alert_suppressed      boolean NOT NULL DEFAULT false,
  match_reasons         text[] NOT NULL DEFAULT '{}',
  conflict_reasons      text[] NOT NULL DEFAULT '{}',
  severity              text,
  confidence            numeric,
  driver_snapshot       jsonb NOT NULL DEFAULT '{}',
  observed_at           timestamptz NOT NULL DEFAULT now(),
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_observations_business_scope CHECK (business_id = tenant_id),
  CONSTRAINT van_damage_observations_item_uidx UNIQUE (tenant_id, item_id)
);
CREATE INDEX IF NOT EXISTS van_damage_observations_case_idx
  ON public.van_damage_observations (tenant_id, business_id, damage_case_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS van_damage_observations_inspection_idx
  ON public.van_damage_observations (tenant_id, business_id, inspection_id);

ALTER TABLE public.van_damage_items ADD COLUMN IF NOT EXISTS damage_case_id uuid REFERENCES public.van_damage_cases(id) ON DELETE SET NULL;
ALTER TABLE public.van_damage_items ADD COLUMN IF NOT EXISTS observation_type text;
ALTER TABLE public.van_damage_items ADD COLUMN IF NOT EXISTS normalized_damage_type text;
ALTER TABLE public.van_damage_items ADD COLUMN IF NOT EXISTS canonical_region text;
CREATE INDEX IF NOT EXISTS van_damage_items_case_idx ON public.van_damage_items (tenant_id, business_id, damage_case_id);

CREATE OR REPLACE FUNCTION public.van_damage_slack_ts_to_timestamptz(value text)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN value ~ '^[0-9]{9,}(\\.[0-9]{1,6})?$'
      THEN to_timestamp(split_part(value, '.', 1)::double precision
        + COALESCE(('0.' || NULLIF(split_part(value, '.', 2), ''))::double precision, 0))
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.van_damage_normalize_region(value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN value IS NULL OR value IN ('', 'unknown', 'unspecified') THEN 'unspecified'
    WHEN value ILIKE '%front%' THEN 'front_bumper'
    WHEN value ILIKE '%rear%' OR value ILIKE '%back%' THEN 'rear_bumper'
    WHEN value ILIKE '%driver%' OR value ILIKE '%left%' THEN 'driver_side'
    WHEN value ILIKE '%passenger%' OR value ILIKE '%right%' THEN 'passenger_side'
    WHEN value ILIKE '%roof%' THEN 'roof'
    WHEN value ILIKE '%hood%' THEN 'hood'
    WHEN value ILIKE '%mirror%' THEN 'mirror'
    WHEN value ILIKE '%wheel%' OR value ILIKE '%tire%' THEN 'wheel'
    WHEN value ILIKE '%door%' THEN 'door'
    WHEN value ILIKE '%interior%' THEN 'interior'
    ELSE regexp_replace(lower(value), '[^a-z0-9]+', '_', 'g')
  END;
$$;

CREATE OR REPLACE FUNCTION public.van_damage_normalize_type(value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN value IS NULL OR value IN ('', 'unknown') THEN 'unknown'
    WHEN value ILIKE '%dirt%' OR value ILIKE '%debris%' THEN 'dirt_debris'
    WHEN value ILIKE '%scratch%' OR value ILIKE '%scuff%' THEN 'scratch'
    WHEN value ILIKE '%dent%' THEN 'dent'
    WHEN value ILIKE '%crack%' THEN 'crack'
    WHEN value ILIKE '%glass%' OR value ILIKE '%window%' OR value ILIKE '%windshield%' THEN 'glass_damage'
    WHEN value ILIKE '%mirror%' THEN 'broken_mirror'
    WHEN value ILIKE '%light%' THEN 'broken_light'
    WHEN value ILIKE '%paint%' THEN 'paint_damage'
    WHEN value ILIKE '%bumper%' THEN 'bumper_damage'
    WHEN value ILIKE '%wheel%' OR value ILIKE '%tire%' THEN 'tire_wheel_damage'
    WHEN value ILIKE '%interior%' THEN 'interior_damage'
    ELSE regexp_replace(lower(value), '[^a-z0-9]+', '_', 'g')
  END;
$$;

CREATE OR REPLACE FUNCTION public.van_damage_severity_rank(value text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE value WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.van_damage_fingerprint(
  p_tenant_id uuid,
  p_van_id uuid,
  p_region text,
  p_damage_type text
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT p_tenant_id::text || ':' || p_van_id::text || ':' ||
    public.van_damage_normalize_region(p_region) || ':' ||
    public.van_damage_normalize_type(p_damage_type);
$$;

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
  inspection_uuid uuid;
  job_uuid uuid;
  session_uuid uuid;
  file_record jsonb;
  source_key text;
  upload_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_slack_event_id, 0));
  SELECT * INTO integration_row
  FROM public.van_slack_integrations
  WHERE id = p_integration_id AND status = 'connected' AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Slack integration is not connected'; END IF;

  source_key := COALESCE(p_upload_source_key, integration_row.tenant_id::text || ':' || integration_row.slack_team_id || ':' || p_slack_channel_id || ':' || p_slack_message_ts);
  upload_at := COALESCE(public.van_damage_slack_ts_to_timestamptz(p_slack_message_ts), now());

  SELECT * INTO existing_event
  FROM public.van_damage_slack_events
  WHERE slack_event_id = p_slack_event_id;
  IF FOUND THEN
    SELECT j.id, j.inspection_id, j.sqs_message_id
      INTO job_uuid, inspection_uuid, existing_sqs_message_id
    FROM public.van_damage_jobs j
    WHERE j.slack_event_id = p_slack_event_id
    ORDER BY j.created_at ASC LIMIT 1;
    SELECT id INTO session_uuid
    FROM public.van_damage_upload_sessions
    WHERE tenant_id = existing_event.tenant_id AND source_key = source_key
    LIMIT 1;
    event_row_id := existing_event.id;
    inspection_row_id := inspection_uuid;
    job_row_id := job_uuid;
    upload_session_row_id := session_uuid;
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
    p_title, 'queued', source_key, upload_at, COALESCE(p_driver_profile, '{}'),
    jsonb_build_object('slackEventId', p_slack_event_id, 'driver', COALESCE(p_driver_profile, '{}'))
  ) RETURNING id INTO inspection_uuid;

  INSERT INTO public.van_damage_upload_sessions (
    tenant_id, business_id, inspection_id, integration_id, source_key, slack_team_id,
    slack_channel_id, slack_user_id, slack_message_ts, slack_thread_ts, original_text,
    driver_snapshot, upload_started_at, status, review_status
  ) VALUES (
    integration_row.tenant_id, integration_row.business_id, inspection_uuid, integration_row.id,
    source_key, integration_row.slack_team_id, p_slack_channel_id, p_slack_user_id,
    p_slack_message_ts, p_slack_thread_ts, p_title, COALESCE(p_driver_profile, '{}'),
    upload_at, 'queued', 'pending'
  ) ON CONFLICT (tenant_id, source_key) DO UPDATE SET
    inspection_id = EXCLUDED.inspection_id,
    driver_snapshot = COALESCE(NULLIF(EXCLUDED.driver_snapshot, '{}'::jsonb), van_damage_upload_sessions.driver_snapshot),
    updated_at = now()
  RETURNING id INTO session_uuid;

  FOR file_record IN SELECT file_value || jsonb_build_object('ordinality', file_ordinality - 1)
    FROM jsonb_array_elements(COALESCE(p_files, '[]'::jsonb)) WITH ORDINALITY AS files(file_value, file_ordinality) LOOP
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
        SELECT id FROM public.van_damage_images
        WHERE upload_session_id = session_uuid
        ORDER BY COALESCE(upload_order, original_file_index, 2147483647), created_at, id
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

CREATE OR REPLACE FUNCTION public.van_damage_reconcile_cases_for_inspection(p_inspection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inspection_row public.van_damage_inspections%ROWTYPE;
  item_row public.van_damage_items%ROWTYPE;
  case_row public.van_damage_cases%ROWTYPE;
  case_id uuid;
  normalized_region text;
  normalized_type text;
  fingerprint_value text;
  match_count integer;
  observation_type text;
  unresolved_states text[] := ARRAY['active','needs_review','confirmed','repair_scheduled','in_repair','awaiting_verification','recurrent'];
BEGIN
  SELECT * INTO inspection_row
  FROM public.van_damage_inspections
  WHERE id = p_inspection_id
  FOR UPDATE;
  IF NOT FOUND OR inspection_row.van_id IS NULL THEN RETURN; END IF;

  FOR item_row IN
    SELECT * FROM public.van_damage_items
    WHERE inspection_id = p_inspection_id
    ORDER BY created_at, id
  LOOP
    normalized_region := public.van_damage_normalize_region(item_row.vehicle_area);
    normalized_type := public.van_damage_normalize_type(item_row.damage_type);
    fingerprint_value := public.van_damage_fingerprint(inspection_row.tenant_id, inspection_row.van_id, normalized_region, normalized_type);
    PERFORM pg_advisory_xact_lock(hashtextextended(fingerprint_value, 2));
    case_id := NULL;
    observation_type := 'new_damage';

    IF normalized_region = 'unspecified' OR normalized_type = 'unknown' OR COALESCE(item_row.confidence, 1) < 0.55 THEN
      SELECT count(*) INTO match_count
      FROM public.van_damage_cases
      WHERE tenant_id = inspection_row.tenant_id AND business_id = inspection_row.business_id
        AND van_id = inspection_row.van_id AND lifecycle_status = ANY(unresolved_states);
      observation_type := 'possible_duplicate';
      case_id := NULL;
    ELSE
      SELECT count(*) INTO match_count
      FROM public.van_damage_cases
      WHERE tenant_id = inspection_row.tenant_id AND business_id = inspection_row.business_id
        AND van_id = inspection_row.van_id AND fingerprint = fingerprint_value
        AND lifecycle_status = ANY(unresolved_states);

      IF match_count = 1 THEN
        SELECT * INTO case_row
        FROM public.van_damage_cases
        WHERE tenant_id = inspection_row.tenant_id AND business_id = inspection_row.business_id
          AND van_id = inspection_row.van_id AND fingerprint = fingerprint_value
          AND lifecycle_status = ANY(unresolved_states)
        FOR UPDATE;
        case_id := case_row.id;
        observation_type := 'existing_damage_observed';
      ELSIF match_count > 1 THEN
        observation_type := 'possible_duplicate';
      ELSE
        SELECT * INTO case_row
        FROM public.van_damage_cases
        WHERE tenant_id = inspection_row.tenant_id AND business_id = inspection_row.business_id
          AND van_id = inspection_row.van_id AND fingerprint = fingerprint_value
          AND lifecycle_status IN ('repaired','resolved')
        ORDER BY last_observed_at DESC LIMIT 1;
        IF FOUND THEN
          observation_type := 'recurrent_damage';
          INSERT INTO public.van_damage_cases (
            tenant_id, business_id, van_id, canonical_region, normalized_damage_type,
            original_damage_type, first_detected_inspection_id, latest_observed_inspection_id,
            first_detected_at, last_observed_at, observation_count, alert_created_at,
            current_severity, max_observed_severity, lifecycle_status, needs_review,
            recurrence_of_case_id, latest_evidence_image_id, fingerprint, metadata
          ) VALUES (
            inspection_row.tenant_id, inspection_row.business_id, inspection_row.van_id,
            normalized_region, normalized_type, item_row.damage_type, inspection_row.id, inspection_row.id,
            COALESCE(inspection_row.slack_upload_at, inspection_row.created_at), COALESCE(inspection_row.slack_upload_at, now()),
            0, now(), item_row.severity, item_row.severity, 'recurrent', true, case_row.id, item_row.image_id,
            fingerprint_value, jsonb_build_object('recurrenceReason', 'Damage detected again after repair or resolution')
          ) RETURNING id INTO case_id;
        ELSE
          INSERT INTO public.van_damage_cases (
            tenant_id, business_id, van_id, canonical_region, normalized_damage_type,
            original_damage_type, first_detected_inspection_id, latest_observed_inspection_id,
            first_detected_at, last_observed_at, observation_count, alert_created_at,
            current_severity, max_observed_severity, lifecycle_status, needs_review,
            latest_evidence_image_id, fingerprint
          ) VALUES (
            inspection_row.tenant_id, inspection_row.business_id, inspection_row.van_id,
            normalized_region, normalized_type, item_row.damage_type, inspection_row.id, inspection_row.id,
            COALESCE(inspection_row.slack_upload_at, inspection_row.created_at), COALESCE(inspection_row.slack_upload_at, now()),
            0, now(), item_row.severity, item_row.severity,
            CASE WHEN inspection_row.review_status = 'in_review' THEN 'needs_review' ELSE 'active' END,
            inspection_row.review_status = 'in_review', item_row.image_id, fingerprint_value
          ) RETURNING id INTO case_id;
        END IF;
      END IF;
    END IF;

    INSERT INTO public.van_damage_observations (
      tenant_id, business_id, van_id, damage_case_id, inspection_id, item_id,
      image_id, upload_session_id, observation_type, alert_created, alert_suppressed,
      match_reasons, conflict_reasons, severity, confidence, driver_snapshot, observed_at, metadata
    ) VALUES (
      inspection_row.tenant_id, inspection_row.business_id, inspection_row.van_id, case_id,
      inspection_row.id, item_row.id, item_row.image_id, inspection_row.upload_session_id,
      observation_type, observation_type IN ('new_damage','recurrent_damage'),
      observation_type = 'existing_damage_observed',
      CASE WHEN observation_type = 'existing_damage_observed' THEN ARRAY['same canonical region', 'same normalized damage type'] ELSE '{}'::text[] END,
      CASE WHEN observation_type = 'possible_duplicate' THEN ARRAY['ambiguous region, unknown damage type, low confidence, or multiple candidate cases'] ELSE '{}'::text[] END,
      item_row.severity, item_row.confidence, inspection_row.driver_snapshot,
      COALESCE(inspection_row.slack_upload_at, inspection_row.created_at), jsonb_build_object('fingerprint', fingerprint_value)
    ) ON CONFLICT (tenant_id, item_id) DO NOTHING;

    UPDATE public.van_damage_items
    SET damage_case_id = case_id,
        observation_type = observation_type,
        normalized_damage_type = normalized_type,
        canonical_region = normalized_region
    WHERE id = item_row.id;

    IF case_id IS NOT NULL THEN
      UPDATE public.van_damage_cases
      SET latest_observed_inspection_id = inspection_row.id,
          last_observed_at = COALESCE(inspection_row.slack_upload_at, now()),
          observation_count = observation_count + 1,
          latest_evidence_image_id = COALESCE(item_row.image_id, latest_evidence_image_id),
          current_severity = CASE
            WHEN public.van_damage_severity_rank(item_row.severity) >= public.van_damage_severity_rank(current_severity) THEN item_row.severity
            ELSE current_severity
          END,
          max_observed_severity = CASE
            WHEN public.van_damage_severity_rank(item_row.severity) >= public.van_damage_severity_rank(max_observed_severity) THEN item_row.severity
            ELSE max_observed_severity
          END,
          duplicate_alert_suppression_count = duplicate_alert_suppression_count + CASE WHEN observation_type = 'existing_damage_observed' THEN 1 ELSE 0 END,
          updated_at = now()
      WHERE id = case_id;
    END IF;
  END LOOP;

  UPDATE public.van_damage_upload_sessions
  SET van_id = inspection_row.van_id,
      status = inspection_row.status,
      review_status = inspection_row.review_status,
      damage_result = CASE WHEN inspection_row.damage_count > 0 THEN 'damage_detected' ELSE 'no_damage_detected' END,
      first_image_id = COALESCE(first_image_id, (
        SELECT id FROM public.van_damage_images
        WHERE upload_session_id = inspection_row.upload_session_id
        ORDER BY COALESCE(upload_order, original_file_index, 2147483647), created_at, id
        LIMIT 1
      ))
  WHERE id = inspection_row.upload_session_id;

  UPDATE public.vehicles v
  SET metadata = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(v.metadata, '{}'::jsonb),
        '{vanDamage,activeCaseCount}',
        to_jsonb((SELECT count(*) FROM public.van_damage_cases c WHERE c.tenant_id = inspection_row.tenant_id AND c.van_id = inspection_row.van_id AND c.lifecycle_status IN ('active','needs_review','confirmed','repair_scheduled','in_repair','awaiting_verification','recurrent'))),
        true
      ),
      '{vanDamage,latestUploadSessionId}',
      to_jsonb(inspection_row.upload_session_id),
      true
    ),
    '{vanDamage,profileImage}',
    COALESCE(v.metadata #> '{vanDamage,profileImage}', jsonb_build_object(
      'mode', 'automatic_first_upload',
      'imageId', (
        SELECT i.id FROM public.van_damage_images i
        JOIN public.van_damage_inspections vi ON vi.id = i.inspection_id
        WHERE vi.tenant_id = inspection_row.tenant_id AND vi.van_id = inspection_row.van_id
          AND i.s3_key IS NOT NULL AND i.status IN ('uploaded','analyzed')
        ORDER BY COALESCE(i.upload_order, i.original_file_index, 2147483647), i.created_at, i.id
        LIMIT 1
      )
    )),
    true
  )
  WHERE v.id = inspection_row.van_id AND v.tenant_id = inspection_row.tenant_id
    AND v.metadata #>> '{vanDamage,profileImage,mode}' IS NULL;
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
      estimated_cost_min, estimated_cost_max, bounding_box, metadata,
      normalized_damage_type, canonical_region
    ) VALUES (
      job_row.tenant_id, job_row.business_id, p_inspection_id,
      NULLIF(item ->> 'imageId', '')::uuid, item ->> 'damageType', item ->> 'vehicleArea',
      item ->> 'severity', NULLIF(item ->> 'confidence', '')::numeric,
      item ->> 'description', item ->> 'repairRecommendation',
      NULLIF(item ->> 'estimatedCostMin', '')::numeric,
      NULLIF(item ->> 'estimatedCostMax', '')::numeric,
      NULLIF(item -> 'boundingBox', 'null'::jsonb), COALESCE(item -> 'metadata', '{}'::jsonb),
      public.van_damage_normalize_type(item ->> 'damageType'),
      public.van_damage_normalize_region(item ->> 'vehicleArea')
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
  PERFORM public.van_damage_reconcile_cases_for_inspection(p_inspection_id);
  UPDATE public.van_damage_jobs SET status = 'completed', completed_at = now(), last_error = NULL
  WHERE id = p_job_id;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'van_slack_user_profiles', 'van_damage_upload_sessions', 'van_damage_cases'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      table_name, table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.van_slack_user_profiles,
  public.van_damage_upload_sessions,
  public.van_damage_cases,
  public.van_damage_observations
TO service_role;

GRANT SELECT ON TABLE
  public.van_slack_user_profiles,
  public.van_damage_upload_sessions,
  public.van_damage_cases,
  public.van_damage_observations
TO authenticated;

ALTER TABLE public.van_slack_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.van_damage_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.van_damage_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.van_damage_observations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'van_slack_user_profiles', 'van_damage_upload_sessions', 'van_damage_cases', 'van_damage_observations'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all_%I ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY service_role_all_%I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      table_name, table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS tenant_read_%I ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY tenant_read_%I ON public.%I FOR SELECT TO authenticated USING (EXISTS (
        SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.status = ''active''
          AND (u.role = ''owner'' OR u.tenant_id = %I.tenant_id)
      ))',
      table_name, table_name, table_name
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.van_damage_reconcile_cases_for_inspection(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.van_damage_reconcile_cases_for_inspection(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_van_damage_slack_event(uuid,text,text,text,text,jsonb,text,text,text,jsonb,jsonb,text) TO service_role;

NOTIFY pgrst, 'reload schema';
