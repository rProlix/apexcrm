-- Phase 3H: immutable first-detected Level 3 attribution and tenant-scoped
-- Fleet maintenance using the existing Slack workspace integration.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Existing rows are inspection channels. A channel has exactly one purpose.
ALTER TABLE public.van_slack_channels
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'damage_inspection';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'van_slack_channels_purpose_check'
      AND conrelid = 'public.van_slack_channels'::regclass
  ) THEN
    ALTER TABLE public.van_slack_channels
      ADD CONSTRAINT van_slack_channels_purpose_check
      CHECK (purpose IN ('damage_inspection', 'maintenance'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS van_slack_channels_one_maintenance_uidx
  ON public.van_slack_channels (tenant_id, integration_id)
  WHERE purpose = 'maintenance' AND is_enabled;
CREATE INDEX IF NOT EXISTS van_slack_channels_purpose_lookup_idx
  ON public.van_slack_channels (integration_id, slack_channel_id, purpose, is_enabled);

-- Durable first-evidence attribution belongs to the damage case and survives
-- repair. A recurrent case receives independent attribution.
ALTER TABLE public.van_damage_cases
  ADD COLUMN IF NOT EXISTS first_observation_id uuid REFERENCES public.van_damage_observations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_upload_session_id uuid REFERENCES public.van_damage_upload_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_evidence_image_id uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_reporter_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS first_source_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS first_source_timestamp_kind text,
  ADD COLUMN IF NOT EXISTS first_attribution_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_uploader_snapshot jsonb;

CREATE INDEX IF NOT EXISTS van_damage_cases_first_source_idx
  ON public.van_damage_cases (tenant_id, business_id, van_id, first_source_timestamp);

CREATE OR REPLACE FUNCTION public.refresh_van_damage_case_attribution(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_case public.van_damage_cases%ROWTYPE;
  earliest record;
  latest record;
  first_changed boolean := false;
BEGIN
  SELECT * INTO current_case
  FROM public.van_damage_cases
  WHERE id = p_case_id
  FOR UPDATE;
  IF current_case.id IS NULL THEN RETURN; END IF;

  SELECT
    observation.id AS observation_id,
    observation.inspection_id,
    observation.upload_session_id,
    observation.image_id,
    COALESCE(
      NULLIF(session.driver_snapshot, '{}'::jsonb),
      NULLIF(inspection.driver_snapshot, '{}'::jsonb),
      NULLIF(observation.driver_snapshot, '{}'::jsonb)
    ) AS reporter_snapshot,
    COALESCE(
      image.slack_file_created_at,
      public.van_damage_slack_ts_to_timestamptz(session.slack_message_ts),
      session.upload_started_at,
      inspection.slack_upload_at,
      public.van_damage_slack_ts_to_timestamptz(inspection.slack_message_ts),
      inspection.created_at,
      observation.observed_at,
      observation.created_at
    ) AS source_timestamp,
    CASE
      WHEN image.slack_file_created_at IS NOT NULL THEN 'slack_file'
      WHEN public.van_damage_slack_ts_to_timestamptz(session.slack_message_ts) IS NOT NULL THEN 'slack_message'
      WHEN session.upload_started_at IS NOT NULL THEN 'upload_session'
      WHEN inspection.slack_upload_at IS NOT NULL
        OR public.van_damage_slack_ts_to_timestamptz(inspection.slack_message_ts) IS NOT NULL
        THEN 'inspection_submission'
      WHEN inspection.created_at IS NOT NULL THEN 'inspection_created_fallback'
      WHEN observation.observed_at IS NOT NULL THEN 'observation'
      ELSE 'database_created_fallback'
    END AS source_kind
  INTO earliest
  FROM public.van_damage_observations observation
  JOIN public.van_damage_inspections inspection
    ON inspection.id = observation.inspection_id
   AND inspection.tenant_id = observation.tenant_id
  LEFT JOIN public.van_damage_upload_sessions session
    ON session.id = observation.upload_session_id
   AND session.tenant_id = observation.tenant_id
  LEFT JOIN public.van_damage_images image
    ON image.id = observation.image_id
   AND image.tenant_id = observation.tenant_id
  LEFT JOIN public.van_damage_items item
    ON item.id = observation.item_id
   AND item.tenant_id = observation.tenant_id
  WHERE observation.damage_case_id = p_case_id
    AND observation.tenant_id = current_case.tenant_id
    AND observation.business_id = current_case.business_id
    AND inspection.review_status <> 'dismissed'
    AND COALESCE(observation.metadata ->> 'invalidated', 'false') <> 'true'
    AND COALESCE(observation.metadata ->> 'dismissed', 'false') <> 'true'
    AND COALESCE(item.metadata ->> 'falsePositive', 'false') <> 'true'
  ORDER BY
    COALESCE(
      image.slack_file_created_at,
      public.van_damage_slack_ts_to_timestamptz(session.slack_message_ts),
      session.upload_started_at,
      inspection.slack_upload_at,
      public.van_damage_slack_ts_to_timestamptz(inspection.slack_message_ts),
      inspection.created_at,
      observation.observed_at,
      observation.created_at
    ) ASC,
    observation.observed_at ASC,
    observation.id ASC
  LIMIT 1;

  SELECT
    observation.id,
    COALESCE(
      NULLIF(session.driver_snapshot, '{}'::jsonb),
      NULLIF(inspection.driver_snapshot, '{}'::jsonb),
      NULLIF(observation.driver_snapshot, '{}'::jsonb)
    ) AS uploader_snapshot
  INTO latest
  FROM public.van_damage_observations observation
  JOIN public.van_damage_inspections inspection ON inspection.id = observation.inspection_id
  LEFT JOIN public.van_damage_upload_sessions session ON session.id = observation.upload_session_id
  LEFT JOIN public.van_damage_items item
    ON item.id = observation.item_id
   AND item.tenant_id = observation.tenant_id
  WHERE observation.damage_case_id = p_case_id
    AND observation.tenant_id = current_case.tenant_id
    AND observation.business_id = current_case.business_id
    AND inspection.review_status <> 'dismissed'
    AND COALESCE(observation.metadata ->> 'invalidated', 'false') <> 'true'
    AND COALESCE(observation.metadata ->> 'dismissed', 'false') <> 'true'
    AND COALESCE(item.metadata ->> 'falsePositive', 'false') <> 'true'
  ORDER BY observation.observed_at DESC, observation.id DESC
  LIMIT 1;

  IF earliest.observation_id IS NOT NULL THEN
    first_changed := current_case.first_observation_id IS DISTINCT FROM earliest.observation_id;
    UPDATE public.van_damage_cases
    SET first_observation_id = earliest.observation_id,
        first_detected_inspection_id = earliest.inspection_id,
        first_upload_session_id = earliest.upload_session_id,
        first_evidence_image_id = earliest.image_id,
        first_reporter_snapshot = earliest.reporter_snapshot,
        first_source_timestamp = earliest.source_timestamp,
        first_source_timestamp_kind = earliest.source_kind,
        first_attribution_resolved_at = now(),
        first_detected_at = earliest.source_timestamp,
        latest_uploader_snapshot = latest.uploader_snapshot
    WHERE id = p_case_id;

    IF first_changed THEN
      INSERT INTO public.activity_logs (
        tenant_id, actor_type, action, entity_type, entity_id, metadata
      ) VALUES (
        current_case.tenant_id,
        'system',
        CASE WHEN earliest.reporter_snapshot IS NULL
          THEN 'van_damage_first_reporter_unavailable'
          ELSE 'van_damage_first_reporter_resolved'
        END,
        'van_damage_case',
        p_case_id,
        jsonb_strip_nulls(jsonb_build_object(
          'firstObservationId', earliest.observation_id,
          'firstInspectionId', earliest.inspection_id,
          'firstUploadSessionId', earliest.upload_session_id,
          'firstEvidenceImageId', earliest.image_id,
          'firstSourceTimestamp', earliest.source_timestamp,
          'timestampKind', earliest.source_kind
        ))
      );
    ELSIF latest.id IS NOT NULL THEN
      INSERT INTO public.activity_logs (
        tenant_id, actor_type, action, entity_type, entity_id, metadata
      ) VALUES (
        current_case.tenant_id, 'system', 'van_damage_repeated_observation',
        'van_damage_case', p_case_id,
        jsonb_build_object('latestObservationId', latest.id)
      );
    END IF;
  ELSE
    first_changed := current_case.first_observation_id IS NOT NULL
      OR current_case.first_attribution_resolved_at IS NULL;
    UPDATE public.van_damage_cases
    SET first_observation_id = NULL,
        first_upload_session_id = NULL,
        first_evidence_image_id = NULL,
        first_reporter_snapshot = NULL,
        first_source_timestamp = COALESCE(current_case.first_source_timestamp, current_case.first_detected_at),
        first_source_timestamp_kind = COALESCE(current_case.first_source_timestamp_kind, 'legacy_case_fallback'),
        first_attribution_resolved_at = now(),
        latest_uploader_snapshot = NULL
    WHERE id = p_case_id;
    IF first_changed THEN
      INSERT INTO public.activity_logs (
        tenant_id, actor_type, action, entity_type, entity_id, metadata
      ) VALUES (
        current_case.tenant_id, 'system', 'van_damage_first_reporter_unavailable',
        'van_damage_case', p_case_id,
        jsonb_build_object(
          'firstSourceTimestamp', COALESCE(current_case.first_source_timestamp, current_case.first_detected_at),
          'timestampKind', COALESCE(current_case.first_source_timestamp_kind, 'legacy_case_fallback')
        )
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.van_damage_observation_attribution_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.damage_case_id IS NOT NULL THEN
      PERFORM public.refresh_van_damage_case_attribution(OLD.damage_case_id);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.damage_case_id IS NOT NULL THEN
    PERFORM public.refresh_van_damage_case_attribution(NEW.damage_case_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.damage_case_id IS DISTINCT FROM NEW.damage_case_id
     AND OLD.damage_case_id IS NOT NULL THEN
    PERFORM public.refresh_van_damage_case_attribution(OLD.damage_case_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS van_damage_observations_refresh_attribution
  ON public.van_damage_observations;
CREATE CONSTRAINT TRIGGER van_damage_observations_refresh_attribution
AFTER INSERT OR UPDATE OR DELETE ON public.van_damage_observations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.van_damage_observation_attribution_trigger();

DO $$
DECLARE damage_case_id uuid;
BEGIN
  FOR damage_case_id IN SELECT id FROM public.van_damage_cases LOOP
    PERFORM public.refresh_van_damage_case_attribution(damage_case_id);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.fleet_maintenance_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_number    bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  van_id                uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  title                 text NOT NULL,
  description           text NOT NULL DEFAULT '',
  category              text NOT NULL DEFAULT 'other',
  severity              text NOT NULL DEFAULT 'unknown',
  operational_impact    text NOT NULL DEFAULT 'unknown',
  time_sensitivity      text NOT NULL DEFAULT 'unknown',
  resolution_effort     text NOT NULL DEFAULT 'unknown',
  scheduling_dependency text NOT NULL DEFAULT 'unknown',
  effective_priority    text NOT NULL DEFAULT 'normal',
  priority_reason       text NOT NULL DEFAULT 'Triage requires review.',
  triage_confidence     numeric CHECK (triage_confidence IS NULL OR triage_confidence BETWEEN 0 AND 1),
  needs_review          boolean NOT NULL DEFAULT true,
  status                text NOT NULL DEFAULT 'needs_review',
  source                text NOT NULL DEFAULT 'manual',
  integration_id        uuid REFERENCES public.van_slack_integrations(id) ON DELETE SET NULL,
  slack_team_id         text,
  slack_channel_id      text,
  slack_message_ts      text,
  slack_thread_ts       text,
  slack_reporter_id     text,
  reporter_snapshot     jsonb NOT NULL DEFAULT '{}',
  slack_source_available boolean NOT NULL DEFAULT true,
  reported_at           timestamptz NOT NULL DEFAULT now(),
  due_at                timestamptz,
  scheduled_at          timestamptz,
  started_at            timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  assigned_user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  mileage               numeric CHECK (mileage IS NULL OR mileage >= 0),
  vendor                text,
  estimated_cost        numeric CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  actual_cost           numeric CHECK (actual_cost IS NULL OR actual_cost >= 0),
  currency              text NOT NULL DEFAULT 'USD',
  latest_note           text,
  latest_activity_at    timestamptz NOT NULL DEFAULT now(),
  related_inspection_id uuid REFERENCES public.van_damage_inspections(id) ON DELETE SET NULL,
  related_damage_case_id uuid REFERENCES public.van_damage_cases(id) ON DELETE SET NULL,
  created_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_maintenance_items_business_scope CHECK (business_id = tenant_id),
  CONSTRAINT fleet_maintenance_category_check CHECK (category IN (
    'engine_oil','transmission','brakes','tires_wheels','steering_suspension',
    'battery_electrical','cooling_system','hvac','lights','doors_locks',
    'windshield_glass','fluids','body_repair','safety_equipment',
    'preventive_maintenance','registration_compliance','cleaning_sanitation','other'
  )),
  CONSTRAINT fleet_maintenance_severity_check CHECK (severity IN ('critical','high','moderate','low','unknown')),
  CONSTRAINT fleet_maintenance_impact_check CHECK (operational_impact IN ('out_of_service','restricted_use','operational_with_caution','operational','unknown')),
  CONSTRAINT fleet_maintenance_time_check CHECK (time_sensitivity IN ('immediate','same_day','within_48_hours','this_week','routine','unknown')),
  CONSTRAINT fleet_maintenance_effort_check CHECK (resolution_effort IN ('quick_fix','on_site_service','parts_required','appointment_required','repair_shop_required','diagnostic_required','unknown')),
  CONSTRAINT fleet_maintenance_schedule_check CHECK (scheduling_dependency IN ('no_appointment','internal_staff','mobile_service','shop_appointment','vendor_availability','parts_availability','unknown')),
  CONSTRAINT fleet_maintenance_priority_check CHECK (effective_priority IN ('urgent','high','normal','low')),
  CONSTRAINT fleet_maintenance_status_check CHECK (status IN ('reported','needs_review','approved','scheduled','waiting_for_parts','in_progress','completed','cancelled','reopened')),
  CONSTRAINT fleet_maintenance_source_check CHECK (source IN ('slack','manual','inspection','damage_case','system'))
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_maintenance_slack_source_uidx
  ON public.fleet_maintenance_items (tenant_id, slack_team_id, slack_channel_id, slack_message_ts)
  WHERE source = 'slack' AND slack_message_ts IS NOT NULL;
CREATE INDEX IF NOT EXISTS fleet_maintenance_active_priority_idx
  ON public.fleet_maintenance_items (tenant_id, business_id, status, effective_priority, reported_at);
CREATE INDEX IF NOT EXISTS fleet_maintenance_van_activity_idx
  ON public.fleet_maintenance_items (tenant_id, business_id, van_id, latest_activity_at DESC);
CREATE INDEX IF NOT EXISTS fleet_maintenance_due_idx
  ON public.fleet_maintenance_items (tenant_id, due_at)
  WHERE status NOT IN ('completed','cancelled');

CREATE TABLE IF NOT EXISTS public.fleet_maintenance_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  van_id                uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  maintenance_item_id   uuid NOT NULL REFERENCES public.fleet_maintenance_items(id) ON DELETE CASCADE,
  event_type            text NOT NULL,
  note                  text,
  previous_value        jsonb,
  new_value             jsonb,
  actor_type            text NOT NULL DEFAULT 'system',
  actor_user_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  slack_reporter_id     text,
  reporter_snapshot     jsonb NOT NULL DEFAULT '{}',
  slack_channel_id      text,
  slack_message_ts      text,
  slack_event_id        text UNIQUE,
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_maintenance_history_business_scope CHECK (business_id = tenant_id),
  CONSTRAINT fleet_maintenance_history_actor_check CHECK (actor_type IN ('slack_user','crm_user','system','repair_workflow'))
);
CREATE INDEX IF NOT EXISTS fleet_maintenance_history_item_time_idx
  ON public.fleet_maintenance_history (tenant_id, maintenance_item_id, occurred_at, id);

CREATE TABLE IF NOT EXISTS public.fleet_maintenance_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  van_id              uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  maintenance_item_id uuid NOT NULL REFERENCES public.fleet_maintenance_items(id) ON DELETE CASCADE,
  history_event_id    uuid REFERENCES public.fleet_maintenance_history(id) ON DELETE SET NULL,
  source              text NOT NULL DEFAULT 'slack',
  slack_file_id       text,
  filename            text NOT NULL,
  content_type        text,
  file_size_bytes     bigint CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  s3_bucket           text,
  s3_key              text,
  s3_etag             text,
  status              text NOT NULL DEFAULT 'pending',
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_maintenance_attachments_business_scope CHECK (business_id = tenant_id),
  CONSTRAINT fleet_maintenance_attachment_status_check CHECK (status IN ('pending','downloading','uploaded','failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_maintenance_attachment_slack_file_uidx
  ON public.fleet_maintenance_attachments (tenant_id, slack_file_id)
  WHERE slack_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fleet_maintenance_attachment_item_idx
  ON public.fleet_maintenance_attachments (tenant_id, maintenance_item_id, created_at);

CREATE TABLE IF NOT EXISTS public.fleet_maintenance_slack_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id      uuid REFERENCES public.van_slack_integrations(id) ON DELETE SET NULL,
  maintenance_item_id uuid REFERENCES public.fleet_maintenance_items(id) ON DELETE SET NULL,
  slack_event_id      text NOT NULL UNIQUE,
  slack_team_id       text NOT NULL,
  slack_channel_id    text NOT NULL,
  slack_message_ts    text,
  slack_thread_ts     text,
  event_kind          text NOT NULL,
  status              text NOT NULL DEFAULT 'received',
  raw_event            jsonb NOT NULL DEFAULT '{}',
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_maintenance_slack_events_business_scope CHECK (business_id = tenant_id)
);
CREATE INDEX IF NOT EXISTS fleet_maintenance_slack_event_scope_idx
  ON public.fleet_maintenance_slack_events (tenant_id, business_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_fleet_maintenance_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.business_id <> NEW.tenant_id THEN RAISE EXCEPTION 'Business scope mismatch'; END IF;
  IF NEW.van_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vehicles WHERE id = NEW.van_id AND tenant_id = NEW.tenant_id
  ) THEN RAISE EXCEPTION 'Vehicle scope mismatch'; END IF;
  IF NEW.related_inspection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.van_damage_inspections
    WHERE id = NEW.related_inspection_id AND tenant_id = NEW.tenant_id AND business_id = NEW.business_id
  ) THEN RAISE EXCEPTION 'Inspection scope mismatch'; END IF;
  IF NEW.related_damage_case_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.van_damage_cases
    WHERE id = NEW.related_damage_case_id AND tenant_id = NEW.tenant_id AND business_id = NEW.business_id
  ) THEN RAISE EXCEPTION 'Damage case scope mismatch'; END IF;
  IF NEW.assigned_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = NEW.assigned_user_id AND (role = 'owner' OR tenant_id = NEW.tenant_id)
  ) THEN RAISE EXCEPTION 'Assigned user scope mismatch'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fleet_maintenance_items_validate_scope ON public.fleet_maintenance_items;
CREATE TRIGGER fleet_maintenance_items_validate_scope
BEFORE INSERT OR UPDATE ON public.fleet_maintenance_items
FOR EACH ROW EXECUTE FUNCTION public.validate_fleet_maintenance_scope();

CREATE OR REPLACE FUNCTION public.validate_fleet_maintenance_child_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fleet_maintenance_items item
    WHERE item.id = NEW.maintenance_item_id
      AND item.tenant_id = NEW.tenant_id
      AND item.business_id = NEW.business_id
      AND (NEW.van_id IS NULL OR item.van_id IS NOT DISTINCT FROM NEW.van_id)
  ) THEN RAISE EXCEPTION 'Maintenance item scope mismatch'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fleet_maintenance_history_validate_scope ON public.fleet_maintenance_history;
CREATE TRIGGER fleet_maintenance_history_validate_scope
BEFORE INSERT OR UPDATE ON public.fleet_maintenance_history
FOR EACH ROW EXECUTE FUNCTION public.validate_fleet_maintenance_child_scope();
DROP TRIGGER IF EXISTS fleet_maintenance_attachments_validate_scope ON public.fleet_maintenance_attachments;
CREATE TRIGGER fleet_maintenance_attachments_validate_scope
BEFORE INSERT OR UPDATE ON public.fleet_maintenance_attachments
FOR EACH ROW EXECUTE FUNCTION public.validate_fleet_maintenance_child_scope();

DROP TRIGGER IF EXISTS fleet_maintenance_items_updated_at ON public.fleet_maintenance_items;
CREATE TRIGGER fleet_maintenance_items_updated_at
BEFORE UPDATE ON public.fleet_maintenance_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS fleet_maintenance_attachments_updated_at ON public.fleet_maintenance_attachments;
CREATE TRIGGER fleet_maintenance_attachments_updated_at
BEFORE UPDATE ON public.fleet_maintenance_attachments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fleet_maintenance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_maintenance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_maintenance_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_maintenance_slack_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_fleet_maintenance_items
  ON public.fleet_maintenance_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_read_fleet_maintenance_items
  ON public.fleet_maintenance_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
      AND (u.role = 'owner' OR u.tenant_id = fleet_maintenance_items.tenant_id)
  ));
CREATE POLICY service_role_all_fleet_maintenance_history
  ON public.fleet_maintenance_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_read_fleet_maintenance_history
  ON public.fleet_maintenance_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
      AND (u.role = 'owner' OR u.tenant_id = fleet_maintenance_history.tenant_id)
  ));
CREATE POLICY service_role_all_fleet_maintenance_attachments
  ON public.fleet_maintenance_attachments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_read_fleet_maintenance_attachments
  ON public.fleet_maintenance_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
      AND (u.role = 'owner' OR u.tenant_id = fleet_maintenance_attachments.tenant_id)
  ));
CREATE POLICY service_role_all_fleet_maintenance_slack_events
  ON public.fleet_maintenance_slack_events FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_maintenance_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_maintenance_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_maintenance_attachments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_maintenance_slack_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fleet_maintenance_items_maintenance_number_seq TO service_role;
GRANT SELECT ON public.fleet_maintenance_items, public.fleet_maintenance_history,
  public.fleet_maintenance_attachments TO authenticated;

CREATE OR REPLACE FUNCTION public.ingest_fleet_maintenance_slack_message(
  p_integration_id uuid,
  p_slack_event_id text,
  p_slack_team_id text,
  p_slack_channel_id text,
  p_slack_user_id text,
  p_slack_message_ts text,
  p_slack_thread_ts text,
  p_text text,
  p_title text,
  p_reporter_snapshot jsonb,
  p_reported_at timestamptz,
  p_van_id uuid,
  p_triage jsonb,
  p_files jsonb,
  p_raw_event jsonb
) RETURNS TABLE (
  maintenance_item_id uuid,
  history_event_id uuid,
  was_created boolean,
  event_kind text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  integration public.van_slack_integrations%ROWTYPE;
  channel public.van_slack_channels%ROWTYPE;
  item public.fleet_maintenance_items%ROWTYPE;
  existing_event record;
  history_id uuid;
  inserted_count integer := 0;
  is_thread boolean := false;
  file jsonb;
BEGIN
  SELECT * INTO integration FROM public.van_slack_integrations
  WHERE id = p_integration_id AND slack_team_id = p_slack_team_id
    AND status = 'connected' AND deleted_at IS NULL;
  IF integration.id IS NULL THEN RAISE EXCEPTION 'Slack integration unavailable'; END IF;

  SELECT * INTO channel FROM public.van_slack_channels
  WHERE integration_id = p_integration_id
    AND slack_channel_id = p_slack_channel_id
    AND purpose = 'maintenance' AND is_enabled;
  IF channel.id IS NULL THEN RAISE EXCEPTION 'Channel is not enabled for maintenance'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    integration.tenant_id::text || ':' || p_slack_event_id, 7
  ));
  INSERT INTO public.fleet_maintenance_slack_events (
    tenant_id, business_id, integration_id, slack_event_id, slack_team_id,
    slack_channel_id, slack_message_ts, slack_thread_ts, event_kind, raw_event
  ) VALUES (
    integration.tenant_id, integration.business_id, integration.id, p_slack_event_id,
    p_slack_team_id, p_slack_channel_id, p_slack_message_ts, p_slack_thread_ts,
    CASE WHEN p_slack_thread_ts IS NOT NULL AND p_slack_thread_ts <> p_slack_message_ts
      THEN 'thread_reply' ELSE 'top_level_report' END,
    COALESCE(p_raw_event, '{}'::jsonb)
  ) ON CONFLICT (slack_event_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count = 0 THEN
    SELECT existing.maintenance_item_id, existing.event_kind INTO existing_event
    FROM public.fleet_maintenance_slack_events existing
    WHERE existing.slack_event_id = p_slack_event_id;
    maintenance_item_id := existing_event.maintenance_item_id;
    event_kind := existing_event.event_kind;
    history_event_id := NULL;
    was_created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  is_thread := p_slack_thread_ts IS NOT NULL AND p_slack_thread_ts <> p_slack_message_ts;
  IF is_thread THEN
    SELECT * INTO item FROM public.fleet_maintenance_items
    WHERE tenant_id = integration.tenant_id
      AND integration_id = integration.id
      AND slack_channel_id = p_slack_channel_id
      AND slack_message_ts = p_slack_thread_ts
    FOR UPDATE;
    IF item.id IS NULL THEN
      UPDATE public.fleet_maintenance_slack_events
      SET status = 'ignored_parent_not_found'
      WHERE slack_event_id = p_slack_event_id;
      maintenance_item_id := NULL;
      history_event_id := NULL;
      was_created := false;
      event_kind := 'thread_parent_not_found';
      RETURN NEXT;
      RETURN;
    END IF;

    INSERT INTO public.fleet_maintenance_history (
      tenant_id, business_id, van_id, maintenance_item_id, event_type, note,
      actor_type, slack_reporter_id, reporter_snapshot, slack_channel_id,
      slack_message_ts, slack_event_id, occurred_at, metadata
    ) VALUES (
      item.tenant_id, item.business_id, item.van_id, item.id, 'slack_note', p_text,
      'slack_user', p_slack_user_id, COALESCE(p_reporter_snapshot, '{}'::jsonb),
      p_slack_channel_id, p_slack_message_ts, p_slack_event_id,
      COALESCE(p_reported_at, now()),
      jsonb_build_object(
        'possibleCompletion', lower(p_text) ~ '\m(fixed|done|repaired|completed)\M',
        'requiresAuthorizedCompletion', true
      )
    ) RETURNING id INTO history_id;
    UPDATE public.fleet_maintenance_items
    SET latest_note = p_text,
        latest_activity_at = GREATEST(latest_activity_at, COALESCE(p_reported_at, now())),
        needs_review = needs_review OR lower(p_text) ~ '\m(dropped again|worse|leak|warning)\M'
    WHERE id = item.id;
    event_kind := 'thread_reply';
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(
      integration.tenant_id::text || ':' || p_slack_channel_id || ':' || p_slack_message_ts, 8
    ));
    SELECT * INTO item FROM public.fleet_maintenance_items
    WHERE tenant_id = integration.tenant_id
      AND slack_team_id = p_slack_team_id
      AND slack_channel_id = p_slack_channel_id
      AND slack_message_ts = p_slack_message_ts
    FOR UPDATE;
    IF item.id IS NULL THEN
      INSERT INTO public.fleet_maintenance_items (
        tenant_id, business_id, van_id, title, description, category, severity,
        operational_impact, time_sensitivity, resolution_effort,
        scheduling_dependency, effective_priority, priority_reason,
        triage_confidence, needs_review, status, source, integration_id,
        slack_team_id, slack_channel_id, slack_message_ts, slack_thread_ts,
        slack_reporter_id, reporter_snapshot, reported_at, latest_note,
        latest_activity_at, metadata
      ) VALUES (
        integration.tenant_id, integration.business_id, p_van_id, p_title, p_text,
        COALESCE(p_triage ->> 'category', 'other'),
        COALESCE(p_triage ->> 'severity', 'unknown'),
        COALESCE(p_triage ->> 'operationalImpact', 'unknown'),
        COALESCE(p_triage ->> 'timeSensitivity', 'unknown'),
        COALESCE(p_triage ->> 'resolutionEffort', 'unknown'),
        COALESCE(p_triage ->> 'schedulingDependency', 'unknown'),
        COALESCE(p_triage ->> 'effectivePriority', 'normal'),
        COALESCE(p_triage ->> 'priorityReason', 'Triage requires review.'),
        NULLIF(p_triage ->> 'confidence', '')::numeric,
        COALESCE((p_triage ->> 'needsReview')::boolean, true) OR p_van_id IS NULL,
        CASE WHEN COALESCE((p_triage ->> 'needsReview')::boolean, true) OR p_van_id IS NULL
          THEN 'needs_review' ELSE 'reported' END,
        'slack', integration.id, p_slack_team_id, p_slack_channel_id,
        p_slack_message_ts, p_slack_thread_ts, p_slack_user_id,
        COALESCE(p_reporter_snapshot, '{}'::jsonb), COALESCE(p_reported_at, now()),
        p_text, COALESCE(p_reported_at, now()),
        jsonb_build_object('vanResolution', CASE WHEN p_van_id IS NULL THEN 'unresolved' ELSE 'resolved' END)
      ) RETURNING * INTO item;
      was_created := true;
    ELSE
      was_created := false;
    END IF;
    INSERT INTO public.fleet_maintenance_history (
      tenant_id, business_id, van_id, maintenance_item_id, event_type, note,
      actor_type, slack_reporter_id, reporter_snapshot, slack_channel_id,
      slack_message_ts, slack_event_id, occurred_at, new_value
    ) VALUES (
      item.tenant_id, item.business_id, item.van_id, item.id, 'reported', p_text,
      'slack_user', p_slack_user_id, COALESCE(p_reporter_snapshot, '{}'::jsonb),
      p_slack_channel_id, p_slack_message_ts, p_slack_event_id,
      COALESCE(p_reported_at, now()), p_triage
    ) RETURNING id INTO history_id;
    event_kind := 'top_level_report';
  END IF;

  FOR file IN SELECT * FROM jsonb_array_elements(COALESCE(p_files, '[]'::jsonb)) LOOP
    INSERT INTO public.fleet_maintenance_attachments (
      tenant_id, business_id, van_id, maintenance_item_id, history_event_id,
      source, slack_file_id, filename, content_type, file_size_bytes, metadata
    ) VALUES (
      item.tenant_id, item.business_id, item.van_id, item.id, history_id, 'slack',
      file ->> 'id', COALESCE(file ->> 'name', file ->> 'id'),
      file ->> 'mimetype', NULLIF(file ->> 'size', '')::bigint,
      '{}'::jsonb
    ) ON CONFLICT (tenant_id, slack_file_id) WHERE slack_file_id IS NOT NULL DO NOTHING;
  END LOOP;

  UPDATE public.fleet_maintenance_slack_events
  SET maintenance_item_id = item.id, status = 'processed'
  WHERE slack_event_id = p_slack_event_id;
  INSERT INTO public.activity_logs (
    tenant_id, actor_type, action, entity_type, entity_id, metadata
  ) VALUES (
    item.tenant_id, 'slack_user',
    CASE WHEN is_thread THEN 'fleet_maintenance_note_added' ELSE 'fleet_maintenance_created' END,
    'fleet_maintenance_item', item.id,
    jsonb_build_object('source', 'slack', 'vanResolved', item.van_id IS NOT NULL)
  );

  maintenance_item_id := item.id;
  history_event_id := history_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_van_damage_case_attribution(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_van_damage_case_attribution(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.ingest_fleet_maintenance_slack_message(
  uuid,text,text,text,text,text,text,text,text,jsonb,timestamptz,uuid,jsonb,jsonb,jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_fleet_maintenance_slack_message(
  uuid,text,text,text,text,text,text,text,text,jsonb,timestamptz,uuid,jsonb,jsonb,jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.record_fleet_maintenance_slack_mutation(
  p_integration_id uuid,
  p_slack_event_id text,
  p_slack_team_id text,
  p_slack_channel_id text,
  p_slack_message_ts text,
  p_slack_thread_ts text,
  p_event_kind text,
  p_text text,
  p_previous_text text,
  p_reporter_snapshot jsonb,
  p_occurred_at timestamptz,
  p_raw_event jsonb
) RETURNS TABLE (maintenance_item_id uuid, was_applied boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  integration public.van_slack_integrations%ROWTYPE;
  item public.fleet_maintenance_items%ROWTYPE;
  inserted_count integer := 0;
  is_thread boolean := p_slack_thread_ts IS NOT NULL
    AND p_slack_thread_ts <> p_slack_message_ts;
BEGIN
  IF p_event_kind NOT IN ('message_changed','message_deleted') THEN
    RAISE EXCEPTION 'Unsupported mutation kind';
  END IF;
  SELECT * INTO integration FROM public.van_slack_integrations
  WHERE id = p_integration_id AND slack_team_id = p_slack_team_id
    AND status = 'connected' AND deleted_at IS NULL;
  IF integration.id IS NULL THEN RAISE EXCEPTION 'Slack integration unavailable'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.van_slack_channels
    WHERE integration_id = integration.id AND slack_channel_id = p_slack_channel_id
      AND purpose = 'maintenance' AND is_enabled
  ) THEN RAISE EXCEPTION 'Channel is not enabled for maintenance'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    integration.tenant_id::text || ':' || p_slack_event_id, 9
  ));
  INSERT INTO public.fleet_maintenance_slack_events (
    tenant_id, business_id, integration_id, slack_event_id, slack_team_id,
    slack_channel_id, slack_message_ts, slack_thread_ts, event_kind, raw_event
  ) VALUES (
    integration.tenant_id, integration.business_id, integration.id, p_slack_event_id,
    p_slack_team_id, p_slack_channel_id, p_slack_message_ts, p_slack_thread_ts,
    p_event_kind, COALESCE(p_raw_event, '{}'::jsonb)
  ) ON CONFLICT (slack_event_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN
    SELECT existing.maintenance_item_id INTO maintenance_item_id
    FROM public.fleet_maintenance_slack_events existing
    WHERE existing.slack_event_id = p_slack_event_id;
    was_applied := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF is_thread THEN
    SELECT maintenance.* INTO item
    FROM public.fleet_maintenance_history history
    JOIN public.fleet_maintenance_items maintenance
      ON maintenance.id = history.maintenance_item_id
    WHERE history.tenant_id = integration.tenant_id
      AND history.slack_channel_id = p_slack_channel_id
      AND history.slack_message_ts = p_slack_message_ts
    ORDER BY history.created_at
    LIMIT 1 FOR UPDATE OF maintenance;
  ELSE
    SELECT * INTO item FROM public.fleet_maintenance_items
    WHERE tenant_id = integration.tenant_id
      AND integration_id = integration.id
      AND slack_channel_id = p_slack_channel_id
      AND slack_message_ts = p_slack_message_ts
    FOR UPDATE;
  END IF;

  IF item.id IS NULL THEN
    UPDATE public.fleet_maintenance_slack_events SET status = 'ignored_source_not_found'
    WHERE slack_event_id = p_slack_event_id;
    maintenance_item_id := NULL;
    was_applied := false;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.fleet_maintenance_history (
    tenant_id, business_id, van_id, maintenance_item_id, event_type, note,
    previous_value, new_value, actor_type, reporter_snapshot, slack_channel_id,
    slack_message_ts, slack_event_id, occurred_at
  ) VALUES (
    item.tenant_id, item.business_id, item.van_id, item.id,
    CASE WHEN p_event_kind = 'message_changed' THEN 'slack_report_edited'
      ELSE 'source_slack_message_deleted' END,
    CASE WHEN p_event_kind = 'message_changed' THEN p_text
      ELSE 'The source Slack message was deleted. Business history was preserved.' END,
    CASE WHEN p_previous_text IS NULL THEN NULL ELSE jsonb_build_object('text', p_previous_text) END,
    CASE WHEN p_event_kind = 'message_changed' THEN jsonb_build_object('text', p_text)
      ELSE jsonb_build_object('sourceAvailable', false) END,
    'slack_user', COALESCE(p_reporter_snapshot, '{}'::jsonb), p_slack_channel_id,
    p_slack_message_ts, p_slack_event_id, COALESCE(p_occurred_at, now())
  );

  UPDATE public.fleet_maintenance_items
  SET description = CASE WHEN p_event_kind = 'message_changed' AND NOT is_thread
        THEN p_text ELSE description END,
      latest_note = CASE WHEN p_event_kind = 'message_changed' THEN p_text ELSE latest_note END,
      latest_activity_at = GREATEST(latest_activity_at, COALESCE(p_occurred_at, now())),
      slack_source_available = CASE WHEN p_event_kind = 'message_deleted' AND NOT is_thread
        THEN false ELSE slack_source_available END,
      needs_review = needs_review OR p_event_kind = 'message_changed'
  WHERE id = item.id;
  UPDATE public.fleet_maintenance_slack_events
  SET maintenance_item_id = item.id, status = 'processed'
  WHERE slack_event_id = p_slack_event_id;
  INSERT INTO public.activity_logs (
    tenant_id, actor_type, action, entity_type, entity_id, metadata
  ) VALUES (
    item.tenant_id, 'slack_user',
    CASE WHEN p_event_kind = 'message_changed'
      THEN 'fleet_maintenance_slack_edited' ELSE 'fleet_maintenance_slack_deleted' END,
    'fleet_maintenance_item', item.id, '{}'::jsonb
  );
  maintenance_item_id := item.id;
  was_applied := true;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.record_fleet_maintenance_slack_mutation(
  uuid,text,text,text,text,text,text,text,text,jsonb,timestamptz,jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_fleet_maintenance_slack_mutation(
  uuid,text,text,text,text,text,text,text,text,jsonb,timestamptz,jsonb
) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        AND tablename = 'fleet_maintenance_items'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_maintenance_items;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        AND tablename = 'fleet_maintenance_history'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_maintenance_history;
    END IF;
  END IF;
END $$;

-- Rollback considerations: disable the new maintenance channel first, then
-- drop new functions/tables. Attribution columns can remain harmlessly on
-- damage cases; never rewrite historical observations during rollback.
