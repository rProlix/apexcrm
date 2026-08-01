CREATE TABLE IF NOT EXISTS public.van_damage_favorite_vehicles (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  favorited_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, business_id, vehicle_id),
  CONSTRAINT van_damage_favorite_vehicle_scope CHECK (tenant_id = business_id)
);

CREATE INDEX IF NOT EXISTS van_damage_favorite_vehicles_business_idx
  ON public.van_damage_favorite_vehicles (business_id, updated_at DESC);

ALTER TABLE public.van_damage_favorite_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS van_damage_favorite_vehicles_tenant_select
  ON public.van_damage_favorite_vehicles;
CREATE POLICY van_damage_favorite_vehicles_tenant_select
  ON public.van_damage_favorite_vehicles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.role = 'owner' OR u.tenant_id = van_damage_favorite_vehicles.tenant_id)
    )
  );

DROP POLICY IF EXISTS van_damage_favorite_vehicles_tenant_write
  ON public.van_damage_favorite_vehicles;
CREATE POLICY van_damage_favorite_vehicles_tenant_write
  ON public.van_damage_favorite_vehicles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.role = 'owner' OR u.tenant_id = van_damage_favorite_vehicles.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.role = 'owner' OR u.tenant_id = van_damage_favorite_vehicles.tenant_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.van_damage_favorite_vehicles
  TO authenticated, service_role;

