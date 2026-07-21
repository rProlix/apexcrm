-- Ensure PL/pgSQL resolves observation_type to the local reconciliation
-- decision when it appears on the right-hand side of an UPDATE expression.

CREATE OR REPLACE FUNCTION public.van_damage_reconcile_cases_for_inspection(p_inspection_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_variable
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

REVOKE ALL ON FUNCTION public.van_damage_reconcile_cases_for_inspection(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.van_damage_reconcile_cases_for_inspection(uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
