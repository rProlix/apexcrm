-- Phase 3E: tenant-scoped Level 3 severe-damage attention for Fleet.
-- Vehicle operational status remains independent; Needs Attention is derived
-- from active damage and represented by one active alert per tenant + van.

ALTER TABLE public.van_damage_cases
  ADD COLUMN IF NOT EXISTS effective_severity text,
  ADD COLUMN IF NOT EXISTS severity_reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS severity_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS severity_review_reason text;

CREATE OR REPLACE FUNCTION public.van_damage_severity_level(value text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  WITH normalized AS (
    SELECT lower(trim(regexp_replace(COALESCE(value, ''), '[-]+', ' ', 'g'))) AS severity
  )
  SELECT CASE
    WHEN severity ~ '^[0-9]+$' THEN GREATEST(0, LEAST(severity::integer, 100))
    WHEN severity ~ '^level[ _]?[0-9]+$' THEN GREATEST(0, LEAST(regexp_replace(severity, '[^0-9]', '', 'g')::integer, 100))
    WHEN severity IN ('critical', 'extreme') THEN 4
    WHEN severity IN ('high', 'severe', 'dents or damage', 'dents_or_damage') THEN 3
    WHEN severity IN ('medium', 'moderate', 'light scratches', 'light_scratches', 'scratch', 'scratches') THEN 2
    WHEN severity IN ('low', 'minor', 'dirt', 'debris', 'dirt or debris', 'dirt_or_debris') THEN 1
    WHEN severity IN ('none', 'no damage', 'no_damage', 'no damage detected', 'no_damage_detected') THEN 0
    ELSE 0
  END
  FROM normalized;
$$;

CREATE OR REPLACE FUNCTION public.van_damage_severity_rank(value text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT public.van_damage_severity_level(value);
$$;

CREATE TABLE IF NOT EXISTS public.van_damage_attention_alerts (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id                uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  van_id                     uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  attention_type             text NOT NULL DEFAULT 'severe_damage',
  source_damage_case_id      uuid REFERENCES public.van_damage_cases(id) ON DELETE SET NULL,
  first_triggered_at         timestamptz NOT NULL,
  last_observed_at           timestamptz NOT NULL,
  latest_inspection_id       uuid REFERENCES public.van_damage_inspections(id) ON DELETE SET NULL,
  latest_evidence_image_id   uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  highest_severity           text NOT NULL,
  status                     text NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'resolved', 'dismissed')),
  acknowledged_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  acknowledged_at            timestamptz,
  observation_count          integer NOT NULL DEFAULT 0 CHECK (observation_count >= 0),
  alert_count                integer NOT NULL DEFAULT 1 CHECK (alert_count >= 1),
  suppressed_duplicate_count integer NOT NULL DEFAULT 0 CHECK (suppressed_duplicate_count >= 0),
  resolved_at                timestamptz,
  resolution_reason          text,
  metadata                   jsonb NOT NULL DEFAULT '{}',
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_attention_business_scope CHECK (business_id = tenant_id),
  CONSTRAINT van_damage_attention_type_check CHECK (attention_type = 'severe_damage')
);

CREATE UNIQUE INDEX IF NOT EXISTS van_damage_attention_one_active_van_uidx
  ON public.van_damage_attention_alerts (tenant_id, van_id, attention_type)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS van_damage_attention_tenant_priority_idx
  ON public.van_damage_attention_alerts (tenant_id, business_id, status, highest_severity, first_triggered_at);
CREATE INDEX IF NOT EXISTS van_damage_attention_latest_inspection_idx
  ON public.van_damage_attention_alerts (tenant_id, latest_inspection_id);

DROP TRIGGER IF EXISTS van_damage_attention_alerts_updated_at ON public.van_damage_attention_alerts;
CREATE TRIGGER van_damage_attention_alerts_updated_at
BEFORE UPDATE ON public.van_damage_attention_alerts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.van_damage_attention_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all_van_damage_attention_alerts ON public.van_damage_attention_alerts;
CREATE POLICY service_role_all_van_damage_attention_alerts
  ON public.van_damage_attention_alerts FOR ALL TO service_role
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_read_van_damage_attention_alerts ON public.van_damage_attention_alerts;
CREATE POLICY tenant_read_van_damage_attention_alerts
  ON public.van_damage_attention_alerts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
      AND (u.role = 'owner' OR u.tenant_id = van_damage_attention_alerts.tenant_id)
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.van_damage_attention_alerts TO service_role;
GRANT SELECT ON public.van_damage_attention_alerts TO authenticated;

-- One row per durable case. Legacy findings that predate Phase 3D remain
-- eligible without guessing case-merging relationships.
CREATE OR REPLACE VIEW public.van_damage_active_severe_sources
WITH (security_invoker = true)
AS
SELECT
  damage_case.tenant_id,
  damage_case.business_id,
  damage_case.van_id,
  damage_case.id AS source_damage_case_id,
  NULL::uuid AS source_item_id,
  COALESCE(damage_case.effective_severity, damage_case.current_severity, damage_case.max_observed_severity) AS effective_severity,
  public.van_damage_severity_level(COALESCE(damage_case.effective_severity, damage_case.current_severity, damage_case.max_observed_severity)) AS severity_level,
  damage_case.first_detected_at,
  damage_case.last_observed_at,
  damage_case.latest_observed_inspection_id AS latest_inspection_id,
  damage_case.latest_evidence_image_id,
  damage_case.canonical_region,
  damage_case.normalized_damage_type,
  damage_case.needs_review,
  damage_case.lifecycle_status,
  damage_case.observation_count,
  damage_case.duplicate_alert_suppression_count
FROM public.van_damage_cases AS damage_case
WHERE damage_case.lifecycle_status IN (
  'active', 'needs_review', 'confirmed', 'repair_scheduled',
  'in_repair', 'awaiting_verification', 'recurrent'
)
  AND public.van_damage_severity_level(
    COALESCE(damage_case.effective_severity, damage_case.current_severity, damage_case.max_observed_severity)
  ) >= 3

UNION ALL

SELECT
  inspection.tenant_id,
  inspection.business_id,
  inspection.van_id,
  NULL::uuid AS source_damage_case_id,
  item.id AS source_item_id,
  item.severity AS effective_severity,
  public.van_damage_severity_level(item.severity) AS severity_level,
  COALESCE(inspection.slack_upload_at, inspection.created_at) AS first_detected_at,
  COALESCE(inspection.completed_at, inspection.slack_upload_at, inspection.created_at) AS last_observed_at,
  inspection.id AS latest_inspection_id,
  item.image_id AS latest_evidence_image_id,
  COALESCE(item.canonical_region, public.van_damage_normalize_region(item.vehicle_area)) AS canonical_region,
  COALESCE(item.normalized_damage_type, public.van_damage_normalize_type(item.damage_type)) AS normalized_damage_type,
  inspection.status = 'needs_review' OR inspection.review_status = 'in_review' AS needs_review,
  'legacy_finding'::text AS lifecycle_status,
  1 AS observation_count,
  0 AS duplicate_alert_suppression_count
FROM public.van_damage_items AS item
JOIN public.van_damage_inspections AS inspection ON inspection.id = item.inspection_id
WHERE item.damage_case_id IS NULL
  AND inspection.van_id IS NOT NULL
  AND inspection.status IN ('completed', 'needs_review')
  AND inspection.review_status <> 'dismissed'
  AND COALESCE(inspection.metadata #>> '{phase3c,lifecycle}', '') NOT IN ('rejected', 'repaired', 'archived')
  AND public.van_damage_severity_level(item.severity) >= 3;

GRANT SELECT ON public.van_damage_active_severe_sources TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_van_severe_attention(
  p_tenant_id uuid,
  p_business_id uuid,
  p_van_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_summary record;
  latest_source record;
  existing_alert public.van_damage_attention_alerts%ROWTYPE;
  alert_uuid uuid;
  severity_label text;
  audit_action text;
BEGIN
  IF p_business_id <> p_tenant_id THEN
    RAISE EXCEPTION 'Business scope mismatch';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_van_id::text || ':severe_damage', 3));

  SELECT
    count(*)::integer AS source_count,
    count(DISTINCT source_damage_case_id) FILTER (WHERE source_damage_case_id IS NOT NULL)::integer AS case_count,
    min(first_detected_at) AS first_detected_at,
    max(last_observed_at) AS last_observed_at,
    max(severity_level)::integer AS highest_level,
    COALESCE(sum(observation_count), 0)::integer AS observation_count,
    COALESCE(sum(duplicate_alert_suppression_count), 0)::integer AS suppressed_count,
    count(*) FILTER (WHERE needs_review)::integer AS needs_review_count,
    array_agg(DISTINCT lifecycle_status ORDER BY lifecycle_status) AS lifecycle_states
  INTO source_summary
  FROM public.van_damage_active_severe_sources
  WHERE tenant_id = p_tenant_id AND business_id = p_business_id AND van_id = p_van_id;

  SELECT * INTO latest_source
  FROM public.van_damage_active_severe_sources
  WHERE tenant_id = p_tenant_id AND business_id = p_business_id AND van_id = p_van_id
  ORDER BY last_observed_at DESC, severity_level DESC, source_damage_case_id NULLS LAST, source_item_id
  LIMIT 1;

  SELECT * INTO existing_alert
  FROM public.van_damage_attention_alerts
  WHERE tenant_id = p_tenant_id AND business_id = p_business_id AND van_id = p_van_id
    AND attention_type = 'severe_damage' AND status = 'active'
  FOR UPDATE;

  IF COALESCE(source_summary.source_count, 0) = 0 THEN
    IF FOUND THEN
      UPDATE public.van_damage_attention_alerts
      SET status = 'resolved', resolved_at = now(), resolution_reason = 'No active Level 3 damage remains'
      WHERE id = existing_alert.id;
      INSERT INTO public.activity_logs (tenant_id, actor_type, action, entity_type, entity_id, metadata)
      VALUES (p_tenant_id, 'system', 'van_severe_attention_resolved', 'vehicle', p_van_id,
        jsonb_build_object('attentionAlertId', existing_alert.id));
    END IF;
    UPDATE public.vehicles AS vehicle
    SET metadata = COALESCE(vehicle.metadata, '{}'::jsonb) || jsonb_build_object(
      'vanDamage', COALESCE(vehicle.metadata -> 'vanDamage', '{}'::jsonb) || jsonb_build_object(
        'needsAttention', false,
        'activeSevereCaseCount', 0,
        'severeAttentionAlertId', NULL
      )
    )
    WHERE vehicle.id = p_van_id AND vehicle.tenant_id = p_tenant_id;
    RETURN NULL;
  END IF;

  severity_label := CASE
    WHEN source_summary.highest_level >= 4 THEN 'critical'
    ELSE 'level_3'
  END;

  IF existing_alert.id IS NULL THEN
    INSERT INTO public.van_damage_attention_alerts (
      tenant_id, business_id, van_id, attention_type, source_damage_case_id,
      first_triggered_at, last_observed_at, latest_inspection_id, latest_evidence_image_id,
      highest_severity, observation_count, alert_count, suppressed_duplicate_count, metadata
    ) VALUES (
      p_tenant_id, p_business_id, p_van_id, 'severe_damage', latest_source.source_damage_case_id,
      source_summary.first_detected_at, source_summary.last_observed_at,
      latest_source.latest_inspection_id, latest_source.latest_evidence_image_id,
      severity_label, source_summary.observation_count, 1, source_summary.suppressed_count,
      jsonb_build_object(
        'severeSourceCount', source_summary.source_count,
        'activeSevereCaseCount', source_summary.case_count,
        'needsReviewCount', source_summary.needs_review_count,
        'lifecycleStates', source_summary.lifecycle_states,
        'latestRegion', latest_source.canonical_region,
        'latestDamageType', latest_source.normalized_damage_type
      )
    )
    ON CONFLICT (tenant_id, van_id, attention_type) WHERE status = 'active'
    DO UPDATE SET
      last_observed_at = EXCLUDED.last_observed_at,
      latest_inspection_id = EXCLUDED.latest_inspection_id,
      latest_evidence_image_id = EXCLUDED.latest_evidence_image_id,
      highest_severity = EXCLUDED.highest_severity,
      observation_count = EXCLUDED.observation_count,
      suppressed_duplicate_count = EXCLUDED.suppressed_duplicate_count,
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING id INTO alert_uuid;
    INSERT INTO public.activity_logs (tenant_id, actor_type, action, entity_type, entity_id, metadata)
    VALUES (p_tenant_id, 'system', 'van_severe_attention_created', 'vehicle', p_van_id,
      jsonb_build_object('attentionAlertId', alert_uuid, 'inspectionId', latest_source.latest_inspection_id, 'severity', severity_label));
  ELSE
    alert_uuid := existing_alert.id;
    audit_action := CASE
      WHEN source_summary.highest_level > public.van_damage_severity_level(existing_alert.highest_severity)
        THEN 'van_severe_attention_escalated'
      WHEN source_summary.suppressed_count > existing_alert.suppressed_duplicate_count
        OR source_summary.observation_count > existing_alert.observation_count
        OR source_summary.last_observed_at > existing_alert.last_observed_at
        THEN 'van_severe_attention_observed_again'
      ELSE NULL
    END;
    UPDATE public.van_damage_attention_alerts
    SET source_damage_case_id = COALESCE(source_damage_case_id, latest_source.source_damage_case_id),
        first_triggered_at = LEAST(first_triggered_at, source_summary.first_detected_at),
        last_observed_at = GREATEST(last_observed_at, source_summary.last_observed_at),
        latest_inspection_id = latest_source.latest_inspection_id,
        latest_evidence_image_id = COALESCE(latest_source.latest_evidence_image_id, latest_evidence_image_id),
        highest_severity = severity_label,
        observation_count = source_summary.observation_count,
        alert_count = 1,
        suppressed_duplicate_count = source_summary.suppressed_count,
        metadata = jsonb_build_object(
          'severeSourceCount', source_summary.source_count,
          'activeSevereCaseCount', source_summary.case_count,
          'needsReviewCount', source_summary.needs_review_count,
          'lifecycleStates', source_summary.lifecycle_states,
          'latestRegion', latest_source.canonical_region,
          'latestDamageType', latest_source.normalized_damage_type
        )
    WHERE id = existing_alert.id;
    IF audit_action IS NOT NULL THEN
      INSERT INTO public.activity_logs (tenant_id, actor_type, action, entity_type, entity_id, metadata)
      VALUES (p_tenant_id, 'system', audit_action, 'vehicle', p_van_id,
        jsonb_build_object(
          'attentionAlertId', existing_alert.id,
          'inspectionId', latest_source.latest_inspection_id,
          'suppressedDuplicateCount', source_summary.suppressed_count
        ));
    END IF;
  END IF;

  UPDATE public.vehicles AS vehicle
  SET metadata = COALESCE(vehicle.metadata, '{}'::jsonb) || jsonb_build_object(
    'vanDamage', COALESCE(vehicle.metadata -> 'vanDamage', '{}'::jsonb) || jsonb_build_object(
      'needsAttention', true,
      'activeSevereCaseCount', source_summary.case_count,
      'severeAttentionAlertId', alert_uuid,
      'highestActiveSeverity', severity_label,
      'severeFirstDetectedAt', source_summary.first_detected_at,
      'severeLastObservedAt', source_summary.last_observed_at
    )
  )
  WHERE vehicle.id = p_van_id AND vehicle.tenant_id = p_tenant_id;
  RETURN alert_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.van_damage_case_refresh_attention_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_van_severe_attention(OLD.tenant_id, OLD.business_id, OLD.van_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_van_severe_attention(NEW.tenant_id, NEW.business_id, NEW.van_id);
  IF TG_OP = 'UPDATE' AND (OLD.tenant_id, OLD.van_id) IS DISTINCT FROM (NEW.tenant_id, NEW.van_id) THEN
    PERFORM public.refresh_van_severe_attention(OLD.tenant_id, OLD.business_id, OLD.van_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS van_damage_cases_refresh_severe_attention ON public.van_damage_cases;
CREATE CONSTRAINT TRIGGER van_damage_cases_refresh_severe_attention
AFTER INSERT OR UPDATE OR DELETE ON public.van_damage_cases
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.van_damage_case_refresh_attention_trigger();

CREATE OR REPLACE FUNCTION public.get_fleet_needs_attention(
  p_tenant_id uuid,
  p_business_id uuid
) RETURNS TABLE (
  tenant_id uuid,
  business_id uuid,
  van_id uuid,
  van_number text,
  vehicle_name text,
  make text,
  model text,
  vehicle_year integer,
  plate_number text,
  operational_status text,
  vehicle_metadata jsonb,
  profile_image_id text,
  attention_alert_id uuid,
  acknowledged_by uuid,
  acknowledged_by_name text,
  acknowledged_at timestamptz,
  first_triggered_at timestamptz,
  last_observed_at timestamptz,
  highest_severity text,
  severe_source_count integer,
  active_severe_case_count integer,
  total_active_damage_case_count integer,
  needs_review_count integer,
  observation_count integer,
  suppressed_duplicate_count integer,
  latest_damage_case_id uuid,
  latest_inspection_id uuid,
  latest_evidence_image_id uuid,
  latest_damage_area text,
  latest_damage_type text,
  latest_driver jsonb,
  latest_upload_at timestamptz,
  latest_image_count integer,
  repair_status text,
  recurrent boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    vehicle.tenant_id,
    COALESCE(vehicle.business_id, vehicle.tenant_id),
    vehicle.id,
    vehicle.van_number,
    vehicle.name,
    vehicle.make,
    vehicle.model,
    vehicle.year,
    vehicle.plate_number,
    vehicle.status,
    vehicle.metadata,
    vehicle.metadata #>> '{vanDamage,profileImage,imageId}',
    alert.id,
    alert.acknowledged_by,
    acknowledged_user.email,
    alert.acknowledged_at,
    alert.first_triggered_at,
    alert.last_observed_at,
    alert.highest_severity,
    source_totals.source_count,
    source_totals.case_count,
    active_cases.total_count,
    source_totals.needs_review_count,
    alert.observation_count,
    alert.suppressed_duplicate_count,
    latest.source_damage_case_id,
    alert.latest_inspection_id,
    alert.latest_evidence_image_id,
    latest.canonical_region,
    latest.normalized_damage_type,
    COALESCE(inspection.driver_snapshot, '{}'::jsonb),
    COALESCE(inspection.slack_upload_at, inspection.created_at),
    COALESCE(inspection.image_count, 0),
    source_totals.repair_status,
    source_totals.recurrent
  FROM public.van_damage_attention_alerts AS alert
  JOIN public.vehicles AS vehicle
    ON vehicle.id = alert.van_id AND vehicle.tenant_id = alert.tenant_id
  JOIN LATERAL (
    SELECT
      count(*)::integer AS source_count,
      count(DISTINCT source.source_damage_case_id) FILTER (WHERE source.source_damage_case_id IS NOT NULL)::integer AS case_count,
      count(*) FILTER (WHERE source.needs_review)::integer AS needs_review_count,
      CASE
        WHEN bool_or(source.lifecycle_status = 'in_repair') THEN 'in_repair'
        WHEN bool_or(source.lifecycle_status = 'repair_scheduled') THEN 'repair_scheduled'
        WHEN bool_or(source.lifecycle_status = 'awaiting_verification') THEN 'awaiting_verification'
        ELSE 'active'
      END AS repair_status,
      bool_or(source.lifecycle_status = 'recurrent') AS recurrent
    FROM public.van_damage_active_severe_sources AS source
    WHERE source.tenant_id = alert.tenant_id AND source.business_id = alert.business_id AND source.van_id = alert.van_id
  ) AS source_totals ON source_totals.source_count > 0
  JOIN LATERAL (
    SELECT source.*
    FROM public.van_damage_active_severe_sources AS source
    WHERE source.tenant_id = alert.tenant_id AND source.business_id = alert.business_id AND source.van_id = alert.van_id
    ORDER BY source.last_observed_at DESC, source.severity_level DESC, source.source_damage_case_id NULLS LAST, source.source_item_id
    LIMIT 1
  ) AS latest ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS total_count
    FROM public.van_damage_cases AS damage_case
    WHERE damage_case.tenant_id = alert.tenant_id AND damage_case.business_id = alert.business_id
      AND damage_case.van_id = alert.van_id
      AND damage_case.lifecycle_status IN ('active','needs_review','confirmed','repair_scheduled','in_repair','awaiting_verification','recurrent')
  ) AS active_cases ON true
  LEFT JOIN public.van_damage_inspections AS inspection
    ON inspection.id = alert.latest_inspection_id
    AND inspection.tenant_id = alert.tenant_id AND inspection.business_id = alert.business_id
  LEFT JOIN public.users AS acknowledged_user
    ON acknowledged_user.id = alert.acknowledged_by
    AND (acknowledged_user.tenant_id = alert.tenant_id OR acknowledged_user.role = 'owner')
  WHERE alert.tenant_id = p_tenant_id
    AND alert.business_id = p_business_id
    AND p_tenant_id = p_business_id
    AND alert.status = 'active'
    AND (
      auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid() AND u.status = 'active'
          AND (u.role = 'owner' OR u.tenant_id = p_tenant_id)
      )
    )
  ORDER BY public.van_damage_severity_level(alert.highest_severity) DESC,
    (alert.acknowledged_at IS NULL) DESC,
    alert.first_triggered_at ASC,
    alert.last_observed_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.update_van_severe_attention(
  p_alert_id uuid,
  p_tenant_id uuid,
  p_business_id uuid,
  p_action text,
  p_actor_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alert_row public.van_damage_attention_alerts%ROWTYPE;
  next_lifecycle text;
BEGIN
  IF p_tenant_id <> p_business_id THEN RAISE EXCEPTION 'Business scope mismatch'; END IF;
  SELECT * INTO alert_row FROM public.van_damage_attention_alerts
  WHERE id = p_alert_id AND tenant_id = p_tenant_id AND business_id = p_business_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active severe-damage attention alert not found'; END IF;

  IF p_action = 'acknowledge' THEN
    UPDATE public.van_damage_attention_alerts
    SET acknowledged_by = COALESCE(acknowledged_by, p_actor_id),
        acknowledged_at = COALESCE(acknowledged_at, now())
    WHERE id = p_alert_id;
    INSERT INTO public.activity_logs (tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_tenant_id, 'user', p_actor_id, 'van_severe_attention_acknowledged', 'vehicle', alert_row.van_id,
      jsonb_build_object('attentionAlertId', p_alert_id));
    RETURN;
  END IF;

  next_lifecycle := CASE p_action
    WHEN 'repair_scheduled' THEN 'repair_scheduled'
    WHEN 'in_repair' THEN 'in_repair'
    WHEN 'repaired' THEN 'repaired'
    WHEN 'resolved' THEN 'resolved'
    WHEN 'dismissed' THEN 'dismissed'
    ELSE NULL
  END;
  IF next_lifecycle IS NULL THEN RAISE EXCEPTION 'Unsupported severe-attention action'; END IF;

  UPDATE public.van_damage_cases AS damage_case
  SET lifecycle_status = next_lifecycle,
      repaired_at = CASE WHEN next_lifecycle = 'repaired' THEN now() ELSE damage_case.repaired_at END,
      resolved_at = CASE WHEN next_lifecycle IN ('resolved','dismissed') THEN now() ELSE damage_case.resolved_at END,
      metadata = COALESCE(damage_case.metadata, '{}'::jsonb) || jsonb_build_object(
        'lastFleetAction', p_action,
        'lastFleetActionAt', now(),
        'lastFleetActionBy', p_actor_id,
        'lastFleetActionReason', p_reason
      ),
      updated_at = now()
  WHERE damage_case.tenant_id = p_tenant_id AND damage_case.business_id = p_business_id
    AND damage_case.van_id = alert_row.van_id
    AND damage_case.lifecycle_status IN ('active','needs_review','confirmed','repair_scheduled','in_repair','awaiting_verification','recurrent')
    AND public.van_damage_severity_level(COALESCE(damage_case.effective_severity, damage_case.current_severity, damage_case.max_observed_severity)) >= 3;

  PERFORM public.refresh_van_severe_attention(p_tenant_id, p_business_id, alert_row.van_id);
  INSERT INTO public.activity_logs (tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'user', p_actor_id, 'van_severe_attention_' || p_action, 'vehicle', alert_row.van_id,
    jsonb_build_object('attentionAlertId', p_alert_id, 'reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.review_van_damage_case_severity(
  p_case_id uuid,
  p_tenant_id uuid,
  p_business_id uuid,
  p_effective_severity text,
  p_actor_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  case_row public.van_damage_cases%ROWTYPE;
  previous_effective text;
BEGIN
  IF p_tenant_id <> p_business_id THEN RAISE EXCEPTION 'Business scope mismatch'; END IF;
  IF lower(trim(COALESCE(p_effective_severity, ''))) NOT IN ('level_1', 'level_2', 'level_3', 'critical') THEN
    RAISE EXCEPTION 'Effective severity must be level_1, level_2, level_3, or critical';
  END IF;
  IF trim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A review reason is required'; END IF;

  SELECT * INTO case_row FROM public.van_damage_cases
  WHERE id = p_case_id AND tenant_id = p_tenant_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Damage case not found'; END IF;
  previous_effective := COALESCE(case_row.effective_severity, case_row.current_severity, case_row.max_observed_severity);

  UPDATE public.van_damage_cases
  SET effective_severity = p_effective_severity,
      severity_reviewed_by = p_actor_id,
      severity_reviewed_at = now(),
      severity_review_reason = p_reason,
      updated_at = now()
  WHERE id = p_case_id;

  PERFORM public.refresh_van_severe_attention(p_tenant_id, p_business_id, case_row.van_id);
  INSERT INTO public.activity_logs (tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'user', p_actor_id,
    CASE
      WHEN public.van_damage_severity_level(p_effective_severity) > public.van_damage_severity_level(previous_effective)
        THEN 'van_damage_severity_escalated'
      ELSE 'van_damage_severity_reviewed'
    END,
    'van_damage_case', p_case_id,
    jsonb_build_object('previousSeverity', previous_effective, 'effectiveSeverity', p_effective_severity, 'reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_van_damage_inspection_action(
  p_inspection_id uuid,
  p_tenant_id uuid,
  p_business_id uuid,
  p_action text,
  p_actor_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_lifecycle text;
BEGIN
  IF p_tenant_id <> p_business_id THEN RAISE EXCEPTION 'Business scope mismatch'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.van_damage_inspections
    WHERE id = p_inspection_id AND tenant_id = p_tenant_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Inspection not found';
  END IF;

  next_lifecycle := CASE p_action
    WHEN 'approve' THEN 'confirmed'
    WHEN 'reject' THEN 'dismissed'
    WHEN 'manual_review' THEN 'needs_review'
    WHEN 'mark_repaired' THEN 'repaired'
    WHEN 'archive' THEN 'archived'
    WHEN 'restore' THEN 'active'
    ELSE NULL
  END;
  IF next_lifecycle IS NULL THEN RAISE EXCEPTION 'Unsupported inspection action'; END IF;

  UPDATE public.van_damage_cases AS damage_case
  SET lifecycle_status = next_lifecycle,
      needs_review = next_lifecycle = 'needs_review',
      repaired_at = CASE WHEN next_lifecycle = 'repaired' THEN now() ELSE damage_case.repaired_at END,
      resolved_at = CASE WHEN next_lifecycle = 'dismissed' THEN now() ELSE damage_case.resolved_at END,
      metadata = COALESCE(damage_case.metadata, '{}'::jsonb) || jsonb_build_object(
        'lastInspectionAction', p_action,
        'lastInspectionActionAt', now(),
        'lastInspectionActionBy', p_actor_id
      ),
      updated_at = now()
  WHERE damage_case.tenant_id = p_tenant_id AND damage_case.business_id = p_business_id
    AND damage_case.id IN (
      SELECT DISTINCT item.damage_case_id
      FROM public.van_damage_items AS item
      WHERE item.inspection_id = p_inspection_id AND item.damage_case_id IS NOT NULL
    )
    AND (
      p_action <> 'restore'
      OR damage_case.lifecycle_status IN ('archived', 'dismissed')
    );

  INSERT INTO public.activity_logs (tenant_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, 'user', p_actor_id, 'van_damage_inspection_' || p_action,
    'van_damage_inspection', p_inspection_id, jsonb_build_object('caseLifecycle', next_lifecycle));
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_van_severe_attention(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_van_severe_attention(uuid,uuid,uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_van_damage_case_severity(uuid,uuid,uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_van_damage_inspection_action(uuid,uuid,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_van_severe_attention(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_van_severe_attention(uuid,uuid,uuid,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_van_damage_case_severity(uuid,uuid,uuid,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_van_damage_inspection_action(uuid,uuid,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_fleet_needs_attention(uuid,uuid) TO authenticated, service_role;

-- Backfill one active alert per qualifying van without merging historical
-- damage cases or discarding legacy findings.
DO $$
DECLARE
  source_van record;
BEGIN
  FOR source_van IN
    SELECT DISTINCT tenant_id, business_id, van_id
    FROM public.van_damage_active_severe_sources
  LOOP
    PERFORM public.refresh_van_severe_attention(source_van.tenant_id, source_van.business_id, source_van.van_id);
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'van_damage_attention_alerts'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.van_damage_attention_alerts;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
