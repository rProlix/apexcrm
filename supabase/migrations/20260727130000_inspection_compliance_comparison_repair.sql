-- Inspection compliance, before/after evidence, and human-confirmed repair verification.
-- All evidence references stable private image IDs; no signed URL is persisted.

CREATE OR REPLACE FUNCTION public.van_damage_workflow_is_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.status = 'active'
      AND (u.role = 'owner' OR u.tenant_id = p_tenant_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.van_damage_workflow_is_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.status = 'active'
      AND (u.role = 'owner' OR (u.tenant_id = p_tenant_id AND u.role IN ('admin','manager')))
  )
$$;

CREATE OR REPLACE FUNCTION public.van_damage_workflow_module_active(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_modules tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.module_key = 'damage_ai'
      AND tm.enabled = true
  )
$$;

CREATE TABLE IF NOT EXISTS public.van_inspection_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default fleet schedule',
  is_default boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'UTC',
  operating_days smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  sod_required boolean NOT NULL DEFAULT true,
  sod_due_time time NOT NULL DEFAULT '10:00',
  sod_grace_minutes integer NOT NULL DEFAULT 30 CHECK (sod_grace_minutes BETWEEN 0 AND 1440),
  eod_required boolean NOT NULL DEFAULT true,
  eod_due_time time NOT NULL DEFAULT '20:00',
  eod_grace_minutes integer NOT NULL DEFAULT 30 CHECK (eod_grace_minutes BETWEEN 0 AND 1440),
  sod_required_views text[] NOT NULL DEFAULT ARRAY['front','rear','driver_side','passenger_side'],
  eod_required_views text[] NOT NULL DEFAULT ARRAY['front','rear','driver_side','passenger_side'],
  escalation_thresholds integer[] NOT NULL DEFAULT ARRAY[1,2,3],
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_inspection_schedules_scope CHECK (business_id = tenant_id),
  CONSTRAINT van_inspection_schedules_days CHECK (
    operating_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS van_inspection_schedules_default_uidx
  ON public.van_inspection_schedules (tenant_id) WHERE is_default AND is_active;

CREATE TABLE IF NOT EXISTS public.van_inspection_schedule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.van_inspection_schedules(id) ON DELETE CASCADE,
  van_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  effective_to date,
  operating_days smallint[],
  sod_required boolean,
  sod_due_time time,
  sod_grace_minutes integer CHECK (sod_grace_minutes IS NULL OR sod_grace_minutes BETWEEN 0 AND 1440),
  eod_required boolean,
  eod_due_time time,
  eod_grace_minutes integer CHECK (eod_grace_minutes IS NULL OR eod_grace_minutes BETWEEN 0 AND 1440),
  sod_required_views text[],
  eod_required_views text[],
  reason text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_inspection_schedule_overrides_scope CHECK (business_id = tenant_id),
  CONSTRAINT van_inspection_schedule_overrides_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  UNIQUE (tenant_id, van_id, effective_from)
);
CREATE INDEX IF NOT EXISTS van_inspection_schedule_overrides_lookup_idx
  ON public.van_inspection_schedule_overrides (tenant_id, van_id, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS public.van_inspection_excuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  van_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  slot_date date NOT NULL,
  slot_type text NOT NULL CHECK (slot_type IN ('SOD','EOD')),
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 3 AND 1000),
  excused_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_inspection_excuses_scope CHECK (business_id = tenant_id),
  UNIQUE (tenant_id, van_id, slot_date, slot_type)
);

CREATE TABLE IF NOT EXISTS public.van_damage_comparison_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  van_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  current_inspection_id uuid NOT NULL REFERENCES public.van_damage_inspections(id) ON DELETE CASCADE,
  prior_inspection_id uuid REFERENCES public.van_damage_inspections(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','completed','failed','needs_review')),
  overall_confidence numeric CHECK (overall_confidence IS NULL OR overall_confidence BETWEEN 0 AND 1),
  failure_code text,
  analysis_version text,
  source text NOT NULL DEFAULT 'system' CHECK (source IN ('system','manual','worker')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_comparison_runs_scope CHECK (business_id = tenant_id),
  CONSTRAINT van_damage_comparison_distinct_inspections CHECK (
    prior_inspection_id IS NULL OR prior_inspection_id <> current_inspection_id
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS van_damage_comparison_active_pair_uidx
  ON public.van_damage_comparison_runs
    (tenant_id, current_inspection_id, prior_inspection_id, analysis_version)
  WHERE status IN ('queued','processing','completed','needs_review');
CREATE INDEX IF NOT EXISTS van_damage_comparison_current_idx
  ON public.van_damage_comparison_runs (tenant_id, current_inspection_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.van_damage_comparison_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  comparison_run_id uuid NOT NULL REFERENCES public.van_damage_comparison_runs(id) ON DELETE CASCADE,
  current_image_id uuid NOT NULL REFERENCES public.van_damage_images(id) ON DELETE CASCADE,
  prior_image_id uuid NOT NULL REFERENCES public.van_damage_images(id) ON DELETE CASCADE,
  canonical_view text NOT NULL CHECK (canonical_view IN (
    'front','rear','driver_side','passenger_side','driver_front','driver_rear',
    'passenger_front','passenger_rear','interior','odometer','dashboard','unknown'
  )),
  comparability_status text NOT NULL DEFAULT 'insufficient_evidence'
    CHECK (comparability_status IN (
      'highly_comparable','comparable','low_confidence','different_camera_angle',
      'insufficient_evidence','wrong_view','identity_uncertain'
    )),
  comparability_confidence numeric CHECK (
    comparability_confidence IS NULL OR comparability_confidence BETWEEN 0 AND 1
  ),
  alignment_metadata jsonb NOT NULL DEFAULT '{}',
  alignment_confidence numeric CHECK (
    alignment_confidence IS NULL OR alignment_confidence BETWEEN 0 AND 1
  ),
  rejection_code text,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','confirmed','rejected','not_comparable')),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comparison_run_id, current_image_id, prior_image_id)
);
CREATE INDEX IF NOT EXISTS van_damage_comparison_pairs_run_idx
  ON public.van_damage_comparison_pairs (tenant_id, comparison_run_id, canonical_view);

CREATE TABLE IF NOT EXISTS public.van_damage_comparison_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  comparison_run_id uuid NOT NULL REFERENCES public.van_damage_comparison_runs(id) ON DELETE CASCADE,
  current_finding_id uuid REFERENCES public.van_damage_items(id) ON DELETE SET NULL,
  prior_damage_case_id uuid REFERENCES public.van_damage_cases(id) ON DELETE SET NULL,
  canonical_region text,
  automated_classification text NOT NULL CHECK (automated_classification IN (
    'new_damage','existing_damage','severity_increased','severity_decreased',
    'repaired_or_no_longer_visible','unchanged','new_damage_near_existing_region',
    'unable_to_determine','different_camera_angle','insufficient_evidence','needs_human_review'
  )),
  reviewed_classification text CHECK (reviewed_classification IS NULL OR reviewed_classification IN (
    'new_damage','existing_damage','severity_increased','severity_decreased',
    'unchanged','false_positive','not_comparable','needs_human_review'
  )),
  prior_severity text,
  current_severity text,
  confidence numeric CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  explanation text,
  current_evidence_image_id uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  prior_evidence_image_id uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  human_review_status text NOT NULL DEFAULT 'pending'
    CHECK (human_review_status IN ('pending','confirmed','corrected','rejected')),
  review_note text,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS van_damage_comparison_findings_run_idx
  ON public.van_damage_comparison_findings (tenant_id, comparison_run_id, human_review_status);

CREATE TABLE IF NOT EXISTS public.van_damage_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  van_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  damage_case_id uuid NOT NULL REFERENCES public.van_damage_cases(id) ON DELETE RESTRICT,
  maintenance_item_id uuid REFERENCES public.fleet_maintenance_items(id) ON DELETE SET NULL,
  vendor_name text,
  status text NOT NULL DEFAULT 'awaiting_repair' CHECK (status IN (
    'awaiting_repair','repair_scheduled','repair_in_progress','ready_for_verification',
    'verification_processing','ai_review_complete','human_review_required',
    'verified_repaired','partially_repaired','damage_still_visible',
    'verification_rejected','insufficient_images','reopened'
  )),
  repair_started_at timestamptz,
  repair_completed_at timestamptz,
  verified_repaired_at timestamptz,
  repair_notes text,
  cost_amount numeric CHECK (cost_amount IS NULL OR cost_amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_repairs_scope CHECK (business_id = tenant_id)
);
CREATE INDEX IF NOT EXISTS van_damage_repairs_case_idx
  ON public.van_damage_repairs (tenant_id, damage_case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.van_damage_repair_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  repair_id uuid NOT NULL REFERENCES public.van_damage_repairs(id) ON DELETE CASCADE,
  damage_case_id uuid NOT NULL REFERENCES public.van_damage_cases(id) ON DELETE RESTRICT,
  original_evidence_image_id uuid REFERENCES public.van_damage_images(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ready_for_verification' CHECK (status IN (
    'ready_for_verification','verification_processing','ai_review_complete',
    'human_review_required','verified_repaired','partially_repaired',
    'damage_still_visible','verification_rejected','insufficient_images','reopened'
  )),
  ai_classification text CHECK (ai_classification IS NULL OR ai_classification IN (
    'appears_repaired','appears_partially_repaired','damage_still_visible',
    'new_damage_near_repaired_region','insufficient_images','images_not_comparable',
    'identity_uncertain','wrong_vehicle_region','needs_human_review'
  )),
  ai_confidence numeric CHECK (ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1),
  ai_explanation text,
  human_decision text CHECK (human_decision IS NULL OR human_decision IN (
    'confirm_repaired','confirm_partially_repaired','confirm_damage_still_present',
    'reject_verification_images','request_more_images','reopen_damage_case'
  )),
  human_review_note text,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT van_damage_repair_verifications_scope CHECK (business_id = tenant_id),
  CONSTRAINT repair_verified_requires_human CHECK (
    status <> 'verified_repaired'
    OR (human_decision = 'confirm_repaired' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS van_damage_repair_verifications_status_idx
  ON public.van_damage_repair_verifications (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.van_damage_repair_verification_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  repair_verification_id uuid NOT NULL
    REFERENCES public.van_damage_repair_verifications(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES public.van_damage_images(id) ON DELETE RESTRICT,
  canonical_view text NOT NULL DEFAULT 'unknown',
  image_quality_status text NOT NULL DEFAULT 'unknown'
    CHECK (image_quality_status IN ('acceptable','low_quality','unknown')),
  comparability_status text NOT NULL DEFAULT 'pending'
    CHECK (comparability_status IN (
      'pending','highly_comparable','comparable','low_confidence',
      'different_camera_angle','insufficient_evidence','wrong_view','identity_uncertain'
    )),
  is_replaced boolean NOT NULL DEFAULT false,
  replaced_by_id uuid REFERENCES public.van_damage_repair_verification_images(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repair_verification_id, image_id)
);
CREATE INDEX IF NOT EXISTS van_damage_repair_verification_images_idx
  ON public.van_damage_repair_verification_images (tenant_id, repair_verification_id, created_at);

CREATE OR REPLACE FUNCTION public.validate_van_damage_workflow_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE expected_tenant uuid;
BEGIN
  IF TG_TABLE_NAME = 'van_inspection_schedule_overrides' THEN
    SELECT tenant_id INTO expected_tenant FROM public.van_inspection_schedules WHERE id = NEW.schedule_id;
  ELSIF TG_TABLE_NAME = 'van_damage_comparison_pairs' THEN
    SELECT tenant_id INTO expected_tenant FROM public.van_damage_comparison_runs WHERE id = NEW.comparison_run_id;
  ELSIF TG_TABLE_NAME = 'van_damage_comparison_findings' THEN
    SELECT tenant_id INTO expected_tenant FROM public.van_damage_comparison_runs WHERE id = NEW.comparison_run_id;
  ELSIF TG_TABLE_NAME = 'van_damage_repair_verifications' THEN
    SELECT tenant_id INTO expected_tenant FROM public.van_damage_repairs WHERE id = NEW.repair_id;
  ELSIF TG_TABLE_NAME = 'van_damage_repair_verification_images' THEN
    SELECT tenant_id INTO expected_tenant FROM public.van_damage_repair_verifications WHERE id = NEW.repair_verification_id;
  END IF;
  IF expected_tenant IS NULL OR expected_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant workflow reference rejected';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'van_inspection_schedule_overrides',
    'van_damage_comparison_pairs',
    'van_damage_comparison_findings',
    'van_damage_repair_verifications',
    'van_damage_repair_verification_images'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', table_name || '_scope', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validate_van_damage_workflow_scope()',
      table_name || '_scope', table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'van_inspection_schedules','van_inspection_schedule_overrides','van_inspection_excuses',
    'van_damage_comparison_runs','van_damage_comparison_pairs','van_damage_comparison_findings',
    'van_damage_repairs','van_damage_repair_verifications','van_damage_repair_verification_images'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_all_' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'service_role_all_' || table_name, table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_read_' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.van_damage_workflow_is_member(tenant_id) AND public.van_damage_workflow_module_active(tenant_id))',
      'tenant_read_' || table_name, table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_manage_' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.van_damage_workflow_is_admin(tenant_id) AND public.van_damage_workflow_module_active(tenant_id)) WITH CHECK (public.van_damage_workflow_is_admin(tenant_id) AND public.van_damage_workflow_module_active(tenant_id))',
      'tenant_manage_' || table_name, table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', table_name);
  END LOOP;
END $$;

-- Human decisions are mandatory even for service-role callers.
CREATE OR REPLACE FUNCTION public.prevent_automated_repair_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'verified_repaired' AND (
    NEW.human_decision IS DISTINCT FROM 'confirm_repaired'
    OR NEW.reviewed_by IS NULL
    OR NEW.reviewed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A human reviewer must confirm the repair';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS van_damage_repair_verifications_human_confirmation
  ON public.van_damage_repair_verifications;
CREATE TRIGGER van_damage_repair_verifications_human_confirmation
BEFORE INSERT OR UPDATE ON public.van_damage_repair_verifications
FOR EACH ROW EXECUTE FUNCTION public.prevent_automated_repair_confirmation();
