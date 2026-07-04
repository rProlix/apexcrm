-- Van Damage worker / Supabase Data API compatibility hardening.
--
-- New Supabase projects no longer auto-grant Data API privileges for newly
-- created public tables. RLS policies do not replace PostgreSQL table grants,
-- so grant only the privileges each API role actually needs.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.van_slack_integrations,
  public.van_slack_channels,
  public.van_damage_slack_events,
  public.van_damage_inspections,
  public.van_damage_images,
  public.van_damage_items,
  public.van_damage_jobs,
  public.van_damage_ai_runs
TO service_role;

GRANT SELECT ON TABLE
  public.van_damage_inspections,
  public.van_damage_images,
  public.van_damage_items
TO authenticated;

-- Replace the original ID-only claim function with a tenant/business scoped
-- signature. A malformed or cross-tenant SQS payload must not be able to move
-- a real job into processing before the rest of the payload is validated.
REVOKE ALL ON FUNCTION public.claim_van_damage_job(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.claim_van_damage_job(uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.claim_van_damage_job(
  p_job_id uuid,
  p_tenant_id uuid,
  p_business_id uuid,
  p_inspection_id uuid,
  p_stale_before timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_job public.van_damage_jobs%ROWTYPE;
BEGIN
  IF p_business_id <> p_tenant_id THEN RETURN 'missing'; END IF;

  SELECT * INTO current_job
  FROM public.van_damage_jobs
  WHERE id = p_job_id
    AND tenant_id = p_tenant_id
    AND business_id = p_business_id
    AND inspection_id = p_inspection_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF current_job.status = 'completed' THEN RETURN 'completed'; END IF;
  IF current_job.status = 'processing' AND current_job.updated_at >= p_stale_before THEN RETURN 'busy'; END IF;

  UPDATE public.van_damage_jobs
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      started_at = COALESCE(started_at, now()),
      last_error = NULL
  WHERE id = p_job_id
    AND tenant_id = p_tenant_id
    AND business_id = p_business_id
    AND inspection_id = p_inspection_id;

  UPDATE public.van_damage_inspections
  SET status = 'processing', error_message = NULL
  WHERE id = p_inspection_id
    AND tenant_id = p_tenant_id
    AND business_id = p_business_id;

  RETURN 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_van_damage_job(uuid, uuid, uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_van_damage_job(uuid, uuid, uuid, uuid, timestamptz)
  TO service_role;

-- A non-mutating contract endpoint lets worker health verify that PostgREST's
-- schema cache contains the worker tables and scoped RPC generation.
CREATE OR REPLACE FUNCTION public.van_damage_worker_schema_contract()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'version', '2026-07-04-v1',
    'businessScope', 'tenant_id_equals_business_id',
    'claimRpc', 'tenant_business_inspection_scoped',
    'tables', jsonb_build_array(
      'van_slack_integrations',
      'van_damage_jobs',
      'van_damage_inspections',
      'van_damage_images',
      'van_damage_ai_runs',
      'van_damage_items'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.van_damage_worker_schema_contract()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.van_damage_worker_schema_contract()
  TO service_role;

NOTIFY pgrst, 'reload schema';
