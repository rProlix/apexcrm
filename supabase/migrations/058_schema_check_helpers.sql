-- =============================================================================
-- 058_schema_check_helpers.sql
-- Server-side RPC helpers for schema health checks.
--
-- Why: PostgREST caches the schema at startup. If a table is added via
-- migration, direct queries via `.from('table')` may return PGRST200
-- ("Could not find the table in the schema cache") for a few minutes.
-- These RPC functions bypass PostgREST's schema cache by querying
-- information_schema directly inside the Postgres backend.
--
-- Safe to run multiple times (idempotent via CREATE OR REPLACE).
-- =============================================================================

-- ── check_table_exists ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_table_exists(p_table_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = p_table_name
      AND table_type   IN ('BASE TABLE', 'VIEW')
  );
$$;

COMMENT ON FUNCTION public.check_table_exists(text) IS
  'Returns true when a table or view named p_table_name exists in the public schema.
   Bypasses PostgREST schema cache — safe to call right after a migration.';

-- ── check_column_exists ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_column_exists(p_table_name text, p_column_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = p_table_name
      AND column_name  = p_column_name
  );
$$;

COMMENT ON FUNCTION public.check_column_exists(text, text) IS
  'Returns true when column p_column_name exists on table p_table_name in public schema.
   Bypasses PostgREST schema cache.';

-- ── check_tables_exist (batch) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_tables_exist(p_table_names text[])
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_object_agg(
    t.name,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = t.name
        AND table_type   IN ('BASE TABLE', 'VIEW')
    )
  )
  FROM unnest(p_table_names) AS t(name);
$$;

COMMENT ON FUNCTION public.check_tables_exist(text[]) IS
  'Batch version of check_table_exists. Returns a JSON object mapping each table name
   to a boolean indicating whether it exists in the public schema.
   E.g.: SELECT check_tables_exist(ARRAY[''website_image_plans'',''website_image_jobs'']);
   Returns: {"website_image_plans": true, "website_image_jobs": false}';

-- ── check_website_image_schema ────────────────────────────────────────────────
-- Full health check for the AI website image pipeline schema.
-- Returns a structured JSON object usable by the diagnostics endpoint.
CREATE OR REPLACE FUNCTION public.check_website_image_schema()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_plans_exist  boolean;
  v_jobs_exist   boolean;
  v_ssi_exist    boolean;
  v_wgi_exist    boolean;
  v_result       jsonb;

  -- Required columns: table → column[]
  v_plans_cols   text[] := ARRAY[
    'id','tenant_id','page_id','section_id','status','prompt',
    'aspect_ratio','created_by','created_at','updated_at'
  ];
  v_jobs_cols    text[] := ARRAY[
    'id','tenant_id','plan_id','status','model','prompt','created_at'
  ];
  v_ssi_cols     text[] := ARRAY[
    'id','tenant_id','section_id','plan_id','image_url',
    'slot_key','is_active','is_archived','created_at'
  ];
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='website_image_plans'    AND table_type='BASE TABLE') INTO v_plans_exist;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='website_image_jobs'     AND table_type='BASE TABLE') INTO v_jobs_exist;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='website_section_images' AND table_type='BASE TABLE') INTO v_ssi_exist;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='website_generated_images') INTO v_wgi_exist;

  v_result := jsonb_build_object(
    'tables', jsonb_build_object(
      'website_image_plans',    v_plans_exist,
      'website_image_jobs',     v_jobs_exist,
      'website_section_images', v_ssi_exist,
      'website_generated_images_view', v_wgi_exist
    ),
    'missingColumns', jsonb_build_object(
      'website_image_plans', CASE WHEN v_plans_exist THEN (
        SELECT jsonb_agg(c)
        FROM unnest(v_plans_cols) AS c
        WHERE NOT EXISTS(
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='website_image_plans' AND column_name=c
        )
      ) ELSE NULL END,
      'website_image_jobs', CASE WHEN v_jobs_exist THEN (
        SELECT jsonb_agg(c)
        FROM unnest(v_jobs_cols) AS c
        WHERE NOT EXISTS(
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='website_image_jobs' AND column_name=c
        )
      ) ELSE NULL END,
      'website_section_images', CASE WHEN v_ssi_exist THEN (
        SELECT jsonb_agg(c)
        FROM unnest(v_ssi_cols) AS c
        WHERE NOT EXISTS(
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='website_section_images' AND column_name=c
        )
      ) ELSE NULL END
    ),
    'activateFnExists', EXISTS(
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='activate_website_section_image'
    ),
    'allTablesPresent', v_plans_exist AND v_jobs_exist AND v_ssi_exist
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.check_website_image_schema() IS
  'Returns a JSON health report for all AI website image pipeline tables.
   Call via: SELECT check_website_image_schema();
   Use in API routes as: supabase.rpc("check_website_image_schema")';

-- ── Grants ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.check_table_exists(text)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_column_exists(text, text)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_tables_exist(text[])           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_website_image_schema()         TO authenticated, service_role;
