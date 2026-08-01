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
    avg(a.valid_confidence) FILTER (WHERE a.status IN ('completed','needs_review') AND a.valid_confidence IS NOT NULL),
    COALESCE(sum(a.damage_count) FILTER (WHERE a.status IN ('completed','needs_review')), 0)
  INTO total_count, queued_count, processing_count, completed_count, review_count,
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
  ELSIF review_count > 0 THEN
    aggregate_state := CASE WHEN completed_count + failed_count + skipped_count > 0 THEN 'complete_with_warnings' ELSE 'needs_review' END;
    public_status := 'needs_review';
  ELSIF completed_count > 0 THEN
    aggregate_state := CASE WHEN failed_count + skipped_count > 0 THEN 'complete_with_warnings' ELSE 'complete' END;
    public_status := 'completed';
  ELSIF failed_count > 0 THEN
    aggregate_state := 'failed';
    public_status := 'failed';
  ELSE
    aggregate_state := 'no_analyzable_images';
    public_status := 'failed';
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
      review_status = CASE
        WHEN public_status = 'needs_review' THEN review_status
        WHEN review_status = 'in_review' THEN 'pending'
        ELSE review_status
      END,
      analysis_aggregate_status = aggregate_state,
      image_count = total_count,
      analyzed_image_count = completed_count,
      failed_image_count = failed_count,
      needs_review_image_count = review_count,
      skipped_image_count = skipped_count,
      damage_count = aggregate_damage_count,
      ai_confidence = CASE WHEN valid_confidence_count > 0 THEN aggregate_confidence ELSE NULL END,
      ai_summary = NULLIF(aggregate_summary, ''),
      completed_at = CASE WHEN queued_count = 0 AND processing_count = 0 THEN COALESCE(completed_at, now()) ELSE NULL END,
      error_message = CASE
        WHEN aggregate_state = 'failed' THEN 'All image analyses failed.'
        WHEN aggregate_state = 'no_analyzable_images' THEN 'No images could be analyzed.'
        WHEN aggregate_state = 'complete_with_warnings' AND review_count = 0 THEN 'Some images could not be analyzed.'
        WHEN aggregate_state = 'complete_with_warnings' THEN 'Level 3 damage requires review.'
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_inspection_id
    AND tenant_id = p_tenant_id
    AND business_id = inspection_row.business_id;

  RETURN jsonb_build_object(
    'status', aggregate_state, 'total', total_count, 'queued', queued_count,
    'processing', processing_count, 'completed', completed_count,
    'needsReview', review_count, 'failed', failed_count, 'skipped', skipped_count,
    'validConfidenceCount', valid_confidence_count,
    'confidence', CASE WHEN valid_confidence_count > 0 THEN aggregate_confidence ELSE NULL END
  );
END;
$$;

WITH non_level3 AS (
  SELECT a.id, a.image_id, a.inspection_id, a.tenant_id, a.ai_run_id
  FROM public.van_damage_image_analyses a
  LEFT JOIN public.van_damage_ai_runs r ON r.id = a.ai_run_id
  WHERE a.status = 'needs_review'
    AND COALESCE(NULLIF(r.parsed_response ->> 'damageRating', '')::integer, 0) < 3
), updated_analyses AS (
  UPDATE public.van_damage_image_analyses a
  SET status = 'completed', needs_human_review = false, updated_at = now()
  FROM non_level3 n
  WHERE a.id = n.id
  RETURNING n.image_id, n.inspection_id, n.tenant_id, n.ai_run_id
), updated_images AS (
  UPDATE public.van_damage_images i
  SET status = 'analyzed', updated_at = now()
  FROM updated_analyses a
  WHERE i.id = a.image_id
  RETURNING a.inspection_id, a.tenant_id, a.ai_run_id
), updated_runs AS (
  UPDATE public.van_damage_ai_runs r
  SET status = 'completed',
      parsed_response = jsonb_set(COALESCE(r.parsed_response, '{}'::jsonb), '{needsHumanReview}', 'false'::jsonb, true)
  FROM updated_images i
  WHERE r.id = i.ai_run_id
  RETURNING i.inspection_id, i.tenant_id
)
SELECT public.recalculate_van_damage_inspection_analysis(tenant_id, inspection_id)
FROM (SELECT DISTINCT tenant_id, inspection_id FROM updated_runs) affected;

