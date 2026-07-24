-- Command center: actionable work, setup state, reports, universal notes,
-- and tenant notification preferences/deliveries.
--
-- All records are tenant-scoped. Server-side service-role callers must still
-- include explicit tenant predicates; the policies below protect direct
-- authenticated access.

CREATE OR REPLACE FUNCTION public.command_is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.status = 'active'
      AND (u.role = 'owner' OR u.tenant_id = p_tenant_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.command_is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.status = 'active'
      AND (
        u.role = 'owner'
        OR (u.tenant_id = p_tenant_id AND u.role IN ('admin', 'manager'))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.command_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.status = 'active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.command_has_active_module(
  p_tenant_id uuid,
  p_module_keys text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_modules tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.enabled = true
      AND tm.module_key = ANY (p_module_keys)
  )
$$;

CREATE OR REPLACE FUNCTION public.command_note_entity_belongs_to_tenant(
  p_tenant_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_entity_type
    WHEN 'customer' THEN
      public.command_has_active_module(p_tenant_id, ARRAY['customers', 'contacts', 'leads'])
      AND EXISTS (
        SELECT 1 FROM public.customers r
        WHERE r.id = p_entity_id AND r.tenant_id = p_tenant_id
      )
    WHEN 'vehicle' THEN
      public.command_has_active_module(p_tenant_id, ARRAY['vehicles', 'damage_ai', 'maintenance'])
      AND EXISTS (
        SELECT 1 FROM public.vehicles r
        WHERE r.id = p_entity_id AND r.tenant_id = p_tenant_id
      )
    WHEN 'inspection' THEN
      public.command_has_active_module(p_tenant_id, ARRAY['damage_ai'])
      AND EXISTS (
        SELECT 1 FROM public.van_damage_inspections r
        WHERE r.id = p_entity_id AND r.tenant_id = p_tenant_id
      )
    WHEN 'damage_case' THEN
      public.command_has_active_module(p_tenant_id, ARRAY['damage_ai'])
      AND EXISTS (
        SELECT 1 FROM public.van_damage_items r
        WHERE r.id = p_entity_id AND r.tenant_id = p_tenant_id
      )
    WHEN 'maintenance_item' THEN
      public.command_has_active_module(p_tenant_id, ARRAY['maintenance'])
      AND EXISTS (
        SELECT 1 FROM public.fleet_maintenance_items r
        WHERE r.id = p_entity_id AND r.tenant_id = p_tenant_id
      )
    WHEN 'appointment' THEN
      public.command_has_active_module(p_tenant_id, ARRAY['appointments'])
      AND EXISTS (
        SELECT 1 FROM public.appointments r
        WHERE r.id = p_entity_id AND r.tenant_id = p_tenant_id
      )
    WHEN 'order' THEN
      public.command_has_active_module(p_tenant_id, ARRAY['store'])
      AND EXISTS (
        SELECT 1 FROM public.orders r
        WHERE r.id = p_entity_id AND r.tenant_id = p_tenant_id
      )
    WHEN 'payment' THEN
      public.command_has_active_module(p_tenant_id, ARRAY['payments'])
      AND EXISTS (
        SELECT 1 FROM public.payments r
        WHERE r.id = p_entity_id AND r.tenant_id = p_tenant_id
      )
    WHEN 'website_lead' THEN
      public.command_has_active_module(p_tenant_id, ARRAY['website', 'leads', 'customers'])
      AND EXISTS (
        SELECT 1 FROM public.leads r
        WHERE r.id = p_entity_id AND r.tenant_id = p_tenant_id
      )
    ELSE false
  END
$$;

CREATE TABLE IF NOT EXISTS public.command_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  source_record_type text NOT NULL,
  source_record_id text NOT NULL,
  source_record_label text,
  action_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed', 'snoozed')),
  assigned_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_role text CHECK (assigned_role IS NULL OR assigned_role IN ('admin', 'manager', 'staff')),
  due_at timestamptz,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  latest_activity_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  dismissal_reason text,
  snoozed_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_key, source_record_type, source_record_id, action_type)
);

CREATE INDEX IF NOT EXISTS command_action_items_open_idx
  ON public.command_action_items (tenant_id, status, priority, due_at, latest_activity_at DESC);
CREATE INDEX IF NOT EXISTS command_action_items_assignee_idx
  ON public.command_action_items (tenant_id, assigned_user_id, status);
CREATE INDEX IF NOT EXISTS command_action_items_source_idx
  ON public.command_action_items (tenant_id, source_record_type, source_record_id);

CREATE TABLE IF NOT EXISTS public.command_setup_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  step_key text NOT NULL,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'complete', 'blocked', 'optional', 'dismissed')),
  completed_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  dismissal_reason text,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_key, step_key)
);

CREATE INDEX IF NOT EXISTS command_setup_steps_tenant_idx
  ON public.command_setup_steps (tenant_id, status, module_key);

CREATE TABLE IF NOT EXISTS public.command_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_key text NOT NULL,
  module_key text NOT NULL,
  format text NOT NULL CHECK (format IN ('pdf', 'csv')),
  date_from date NOT NULL,
  date_to date NOT NULL,
  generated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS command_report_runs_tenant_idx
  ON public.command_report_runs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.universal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (
    entity_type IN (
      'customer', 'vehicle', 'inspection', 'damage_case', 'maintenance_item',
      'appointment', 'order', 'payment', 'website_lead'
    )
  ),
  entity_id uuid NOT NULL,
  author_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  author_display_snapshot text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'slack', 'system', 'import')),
  visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'staff_admin', 'customer_visible')),
  is_internal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS universal_notes_entity_idx
  ON public.universal_notes (tenant_id, entity_type, entity_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.universal_note_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.universal_notes(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (
    entity_type IN (
      'customer', 'vehicle', 'inspection', 'damage_case', 'maintenance_item',
      'appointment', 'order', 'payment', 'website_lead'
    )
  ),
  entity_id uuid NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'document-assets'
    CHECK (storage_bucket IN ('document-assets', 'customer-assets', 'appointment-assets', 'damage-assessment-assets')),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  uploaded_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, storage_bucket, storage_path)
);

CREATE INDEX IF NOT EXISTS universal_note_attachments_note_idx
  ON public.universal_note_attachments (tenant_id, note_id, created_at);

CREATE TABLE IF NOT EXISTS public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  module_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  recipient_type text NOT NULL
    CHECK (recipient_type IN ('specific_user', 'role', 'assigned_user', 'record_owner', 'customer')),
  recipient_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_role text CHECK (recipient_role IS NULL OR recipient_role IN ('admin', 'manager', 'staff')),
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'slack')),
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  quiet_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (recipient_type = 'specific_user' AND recipient_user_id IS NOT NULL)
    OR recipient_type <> 'specific_user'
  ),
  CHECK (
    (recipient_type = 'role' AND recipient_role IS NOT NULL)
    OR recipient_type <> 'role'
  )
);

CREATE INDEX IF NOT EXISTS notification_rules_event_idx
  ON public.notification_rules (tenant_id, module_key, event_type, enabled);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.notification_rules(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  module_key text NOT NULL,
  source_record_type text NOT NULL,
  source_record_id text NOT NULL,
  recipient_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_role text,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'slack')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  source_href text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'read')),
  error_code text,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    tenant_id, event_type, source_record_type, source_record_id,
    recipient_user_id, channel, rule_id
  )
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON public.notifications (tenant_id, recipient_user_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.command_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'command_action_items',
    'command_setup_steps',
    'universal_notes',
    'notification_rules'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.command_set_updated_at()',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.command_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.command_setup_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.command_report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.universal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.universal_note_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY command_action_items_member_select
  ON public.command_action_items FOR SELECT TO authenticated
  USING (
    public.command_is_tenant_member(tenant_id)
    AND public.command_has_active_module(tenant_id, ARRAY[module_key])
    AND (
      assigned_user_id IS NULL
      OR assigned_user_id = public.command_current_user_id()
      OR public.command_is_tenant_admin(tenant_id)
    )
  );
CREATE POLICY command_action_items_admin_write
  ON public.command_action_items FOR ALL TO authenticated
  USING (
    public.command_is_tenant_admin(tenant_id)
    AND public.command_has_active_module(tenant_id, ARRAY[module_key])
  )
  WITH CHECK (
    public.command_is_tenant_admin(tenant_id)
    AND public.command_has_active_module(tenant_id, ARRAY[module_key])
  );

CREATE POLICY command_setup_steps_member_select
  ON public.command_setup_steps FOR SELECT TO authenticated
  USING (
    public.command_is_tenant_member(tenant_id)
    AND (module_key = 'core' OR public.command_has_active_module(tenant_id, ARRAY[module_key]))
  );
CREATE POLICY command_setup_steps_admin_write
  ON public.command_setup_steps FOR ALL TO authenticated
  USING (
    public.command_is_tenant_admin(tenant_id)
    AND (module_key = 'core' OR public.command_has_active_module(tenant_id, ARRAY[module_key]))
  )
  WITH CHECK (
    public.command_is_tenant_admin(tenant_id)
    AND (module_key = 'core' OR public.command_has_active_module(tenant_id, ARRAY[module_key]))
  );

CREATE POLICY command_report_runs_member_select
  ON public.command_report_runs FOR SELECT TO authenticated
  USING (
    public.command_is_tenant_member(tenant_id)
    AND public.command_has_active_module(tenant_id, ARRAY[module_key])
  );
CREATE POLICY command_report_runs_admin_insert
  ON public.command_report_runs FOR INSERT TO authenticated
  WITH CHECK (
    public.command_is_tenant_admin(tenant_id)
    AND public.command_has_active_module(tenant_id, ARRAY[module_key])
  );

CREATE POLICY universal_notes_member_select
  ON public.universal_notes FOR SELECT TO authenticated
  USING (
    public.command_is_tenant_member(tenant_id)
    AND public.command_note_entity_belongs_to_tenant(tenant_id, entity_type, entity_id)
  );
CREATE POLICY universal_notes_member_insert
  ON public.universal_notes FOR INSERT TO authenticated
  WITH CHECK (
    public.command_is_tenant_member(tenant_id)
    AND author_user_id = public.command_current_user_id()
    AND public.command_note_entity_belongs_to_tenant(tenant_id, entity_type, entity_id)
  );
CREATE POLICY universal_notes_author_or_admin_update
  ON public.universal_notes FOR UPDATE TO authenticated
  USING (
    public.command_is_tenant_member(tenant_id)
    AND (
      author_user_id = public.command_current_user_id()
      OR public.command_is_tenant_admin(tenant_id)
    )
  )
  WITH CHECK (
    public.command_is_tenant_member(tenant_id)
    AND public.command_note_entity_belongs_to_tenant(tenant_id, entity_type, entity_id)
  );

CREATE POLICY universal_note_attachments_member_select
  ON public.universal_note_attachments FOR SELECT TO authenticated
  USING (
    public.command_is_tenant_member(tenant_id)
    AND public.command_note_entity_belongs_to_tenant(tenant_id, entity_type, entity_id)
  );
CREATE POLICY universal_note_attachments_member_insert
  ON public.universal_note_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.command_is_tenant_member(tenant_id)
    AND uploaded_by = public.command_current_user_id()
    AND public.command_note_entity_belongs_to_tenant(tenant_id, entity_type, entity_id)
    AND EXISTS (
      SELECT 1
      FROM public.universal_notes n
      WHERE n.id = universal_note_attachments.note_id
        AND n.tenant_id = universal_note_attachments.tenant_id
        AND n.entity_type = universal_note_attachments.entity_type
        AND n.entity_id = universal_note_attachments.entity_id
        AND n.archived_at IS NULL
    )
  );
CREATE POLICY universal_note_attachments_admin_delete
  ON public.universal_note_attachments FOR DELETE TO authenticated
  USING (
    public.command_is_tenant_admin(tenant_id)
    AND public.command_note_entity_belongs_to_tenant(tenant_id, entity_type, entity_id)
  );

CREATE POLICY notification_rules_member_select
  ON public.notification_rules FOR SELECT TO authenticated
  USING (
    public.command_is_tenant_member(tenant_id)
    AND (module_key = 'core' OR public.command_has_active_module(tenant_id, ARRAY[module_key]))
  );
CREATE POLICY notification_rules_admin_write
  ON public.notification_rules FOR ALL TO authenticated
  USING (
    public.command_is_tenant_admin(tenant_id)
    AND (module_key = 'core' OR public.command_has_active_module(tenant_id, ARRAY[module_key]))
  )
  WITH CHECK (
    public.command_is_tenant_admin(tenant_id)
    AND (module_key = 'core' OR public.command_has_active_module(tenant_id, ARRAY[module_key]))
  );

CREATE POLICY notifications_recipient_select
  ON public.notifications FOR SELECT TO authenticated
  USING (
    public.command_is_tenant_member(tenant_id)
    AND (module_key = 'core' OR public.command_has_active_module(tenant_id, ARRAY[module_key]))
    AND (
      recipient_user_id = public.command_current_user_id()
      OR public.command_is_tenant_admin(tenant_id)
    )
  );
CREATE POLICY notifications_recipient_update
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    recipient_user_id = public.command_current_user_id()
    OR public.command_is_tenant_admin(tenant_id)
  )
  WITH CHECK (
    public.command_is_tenant_member(tenant_id)
    AND (module_key = 'core' OR public.command_has_active_module(tenant_id, ARRAY[module_key]))
  );

CREATE POLICY service_role_all_command_action_items
  ON public.command_action_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_command_setup_steps
  ON public.command_setup_steps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_command_report_runs
  ON public.command_report_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_universal_notes
  ON public.universal_notes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_universal_note_attachments
  ON public.universal_note_attachments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_notification_rules
  ON public.notification_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_notifications
  ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION public.command_is_tenant_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.command_is_tenant_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.command_current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.command_has_active_module(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.command_note_entity_belongs_to_tenant(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.command_is_tenant_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.command_is_tenant_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.command_current_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.command_has_active_module(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.command_note_entity_belongs_to_tenant(uuid, text, uuid) TO authenticated, service_role;

GRANT SELECT ON public.command_action_items TO authenticated;
GRANT SELECT ON public.command_setup_steps TO authenticated;
GRANT SELECT ON public.command_report_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.universal_notes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.universal_note_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_rules TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON
  public.command_action_items,
  public.command_setup_steps,
  public.command_report_runs,
  public.universal_notes,
  public.universal_note_attachments,
  public.notification_rules,
  public.notifications
TO service_role;
