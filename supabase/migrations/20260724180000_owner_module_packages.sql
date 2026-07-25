-- Owner Module Builder / Package Manager
-- Reusable platform-owner bundles that can atomically replace a tenant's
-- enabled module set while preserving an immutable application history.

CREATE TABLE IF NOT EXISTS public.owner_module_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  benefits text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_module_packages_slug_format
    CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT owner_module_packages_name_length
    CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  CONSTRAINT owner_module_packages_description_length
    CHECK (char_length(description) <= 500),
  CONSTRAINT owner_module_packages_benefits_limit
    CHECK (cardinality(benefits) <= 20)
);

CREATE TABLE IF NOT EXISTS public.owner_module_package_items (
  package_id uuid NOT NULL REFERENCES public.owner_module_packages(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, module_key),
  CONSTRAINT owner_module_package_items_key_format
    CHECK (module_key ~ '^[a-z][a-z0-9_]*$')
);

CREATE TABLE IF NOT EXISTS public.tenant_module_package_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.owner_module_packages(id) ON DELETE SET NULL,
  package_name text NOT NULL,
  applied_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  previous_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_modules text[] NOT NULL DEFAULT '{}',
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_module_packages_status_idx
  ON public.owner_module_packages (status, name);
CREATE INDEX IF NOT EXISTS owner_module_package_items_order_idx
  ON public.owner_module_package_items (package_id, sort_order, module_key);
CREATE INDEX IF NOT EXISTS tenant_module_package_applications_tenant_idx
  ON public.tenant_module_package_applications (tenant_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS tenant_module_package_applications_package_idx
  ON public.tenant_module_package_applications (package_id, applied_at DESC);

DROP TRIGGER IF EXISTS owner_module_packages_set_updated_at
  ON public.owner_module_packages;
CREATE TRIGGER owner_module_packages_set_updated_at
BEFORE UPDATE ON public.owner_module_packages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.owner_module_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_module_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_module_package_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_manage_module_packages
  ON public.owner_module_packages;
CREATE POLICY owner_manage_module_packages
  ON public.owner_module_packages
  FOR ALL TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

DROP POLICY IF EXISTS owner_manage_module_package_items
  ON public.owner_module_package_items;
CREATE POLICY owner_manage_module_package_items
  ON public.owner_module_package_items
  FOR ALL TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

DROP POLICY IF EXISTS owner_read_module_package_applications
  ON public.tenant_module_package_applications;
CREATE POLICY owner_read_module_package_applications
  ON public.tenant_module_package_applications
  FOR SELECT TO authenticated
  USING (public.is_platform_owner());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.owner_module_packages, public.owner_module_package_items
  TO service_role;
GRANT SELECT, INSERT
  ON public.tenant_module_package_applications
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.owner_module_packages, public.owner_module_package_items
  TO authenticated;
GRANT SELECT
  ON public.tenant_module_package_applications
  TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_owner_module_package(
  p_tenant_id uuid,
  p_package_id uuid,
  p_actor_user_id uuid,
  p_all_module_keys text[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_package public.owner_module_packages%ROWTYPE;
  selected_keys text[];
  previous_state jsonb;
  application_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_package_id IS NULL THEN
    RAISE EXCEPTION 'Tenant and package are required';
  END IF;

  IF COALESCE(cardinality(p_all_module_keys), 0) = 0 THEN
    RAISE EXCEPTION 'The canonical module catalog cannot be empty';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_all_module_keys) AS supplied(module_key)
    GROUP BY supplied.module_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'The canonical module catalog contains duplicates';
  END IF;

  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  SELECT *
  INTO selected_package
  FROM public.owner_module_packages
  WHERE id = p_package_id AND status = 'active'
  FOR UPDATE;

  IF selected_package.id IS NULL THEN
    RAISE EXCEPTION 'Active package not found';
  END IF;

  SELECT COALESCE(array_agg(item.module_key ORDER BY item.sort_order, item.module_key), '{}')
  INTO selected_keys
  FROM public.owner_module_package_items AS item
  WHERE item.package_id = p_package_id;

  IF EXISTS (
    SELECT 1
    FROM unnest(selected_keys) AS packaged(module_key)
    WHERE NOT (packaged.module_key = ANY(p_all_module_keys))
  ) THEN
    RAISE EXCEPTION 'Package contains a module outside the canonical catalog';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'moduleKey', module_key,
        'enabled', enabled
      )
      ORDER BY module_key
    ),
    '[]'::jsonb
  )
  INTO previous_state
  FROM public.tenant_modules
  WHERE tenant_id = p_tenant_id
    AND module_key = ANY(p_all_module_keys);

  INSERT INTO public.tenant_modules (
    tenant_id,
    module_key,
    enabled,
    config
  )
  SELECT
    p_tenant_id,
    catalog.module_key,
    catalog.module_key = ANY(selected_keys),
    '{}'::jsonb
  FROM unnest(p_all_module_keys) AS catalog(module_key)
  ON CONFLICT (tenant_id, module_key)
  DO UPDATE SET
    enabled = EXCLUDED.enabled,
    updated_at = now();

  INSERT INTO public.tenant_module_package_applications (
    tenant_id,
    package_id,
    package_name,
    applied_by,
    previous_modules,
    applied_modules
  ) VALUES (
    p_tenant_id,
    p_package_id,
    selected_package.name,
    p_actor_user_id,
    previous_state,
    selected_keys
  )
  RETURNING id INTO application_id;

  INSERT INTO public.activity_logs (
    tenant_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    p_tenant_id,
    'user',
    p_actor_user_id,
    'module_package_applied',
    'module_package',
    p_package_id,
    jsonb_build_object(
      'applicationId', application_id,
      'packageName', selected_package.name,
      'moduleKeys', selected_keys
    )
  );

  RETURN application_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_owner_module_package(uuid, uuid, uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_owner_module_package(uuid, uuid, uuid, text[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.save_owner_module_package(
  p_package_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_benefits text[],
  p_module_keys text[],
  p_actor_user_id uuid,
  p_all_module_keys text[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_id uuid;
BEGIN
  IF trim(COALESCE(p_name, '')) = '' OR trim(COALESCE(p_slug, '')) = '' THEN
    RAISE EXCEPTION 'Package name and slug are required';
  END IF;

  IF COALESCE(cardinality(p_module_keys), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one module';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_module_keys) AS packaged(module_key)
    WHERE NOT (packaged.module_key = ANY(p_all_module_keys))
  ) THEN
    RAISE EXCEPTION 'Package contains a module outside the canonical catalog';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_module_keys) AS packaged(module_key)
    GROUP BY packaged.module_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Package contains duplicate modules';
  END IF;

  IF p_package_id IS NULL THEN
    INSERT INTO public.owner_module_packages (
      slug,
      name,
      description,
      benefits,
      created_by
    ) VALUES (
      lower(trim(p_slug)),
      trim(p_name),
      trim(COALESCE(p_description, '')),
      COALESCE(p_benefits, '{}'),
      p_actor_user_id
    )
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.owner_module_packages
    SET
      slug = lower(trim(p_slug)),
      name = trim(p_name),
      description = trim(COALESCE(p_description, '')),
      benefits = COALESCE(p_benefits, '{}'),
      status = 'active',
      updated_at = now()
    WHERE id = p_package_id
    RETURNING id INTO saved_id;

    IF saved_id IS NULL THEN
      RAISE EXCEPTION 'Package not found';
    END IF;
  END IF;

  DELETE FROM public.owner_module_package_items
  WHERE package_id = saved_id;

  INSERT INTO public.owner_module_package_items (
    package_id,
    module_key,
    sort_order
  )
  SELECT saved_id, module_key, (ordinality * 10)::integer
  FROM unnest(p_module_keys) WITH ORDINALITY AS selected(module_key, ordinality);

  RETURN saved_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_owner_module_package(
  uuid, text, text, text, text[], text[], uuid, text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_owner_module_package(
  uuid, text, text, text, text[], text[], uuid, text[]
) TO service_role;

INSERT INTO public.owner_module_packages (
  slug,
  name,
  description,
  benefits
) VALUES
  (
    'fleet-starter',
    'Fleet Starter',
    'Core fleet visibility with Slack-powered van inspections and damage review.',
    ARRAY['Fleet', 'Van Damage AI', 'Slack inspections']
  ),
  (
    'fleet-pro',
    'Fleet Pro',
    'Complete fleet operations with maintenance, reporting, and staff accountability.',
    ARRAY['Fleet', 'Van Damage AI', 'Maintenance', 'Reports', 'Staff activity']
  ),
  (
    'salon-starter',
    'Salon Starter',
    'The essential customer, booking, and payment workflow for service businesses.',
    ARRAY['Appointments', 'Customers', 'Payments']
  ),
  (
    'retail-pro',
    'Retail Pro',
    'A connected commerce package for products, payments, loyalty, and customers.',
    ARRAY['Store', 'Payments', 'Rewards', 'Customers']
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  benefits = EXCLUDED.benefits,
  status = 'active',
  updated_at = now();

INSERT INTO public.owner_module_package_items (package_id, module_key, sort_order)
SELECT package.id, item.module_key, item.sort_order
FROM public.owner_module_packages AS package
JOIN (
  VALUES
    ('fleet-starter', 'vehicles', 10),
    ('fleet-starter', 'damage_ai', 20),
    ('fleet-pro', 'vehicles', 10),
    ('fleet-pro', 'damage_ai', 20),
    ('fleet-pro', 'maintenance', 30),
    ('salon-starter', 'appointments', 10),
    ('salon-starter', 'customers', 20),
    ('salon-starter', 'payments', 30),
    ('retail-pro', 'store', 10),
    ('retail-pro', 'payments', 20),
    ('retail-pro', 'rewards', 30),
    ('retail-pro', 'customers', 40)
) AS item(package_slug, module_key, sort_order)
  ON item.package_slug = package.slug
ON CONFLICT (package_id, module_key) DO UPDATE SET
  sort_order = EXCLUDED.sort_order;
