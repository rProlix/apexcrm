-- ============================================================
-- 064_inventory_module.sql
-- Full Inventory Module: items, movements, alerts, scan events,
-- settings, product links, RLS, indexes, triggers, and RPCs.
-- Designed to coexist with the Store module without merging.
-- ============================================================

-- ── Reusable updated_at trigger (idempotent) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 1. inventory_items ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                text        NOT NULL,
  description         text,
  sku                 text,
  barcode             text,
  category            text,
  item_type           text        NOT NULL DEFAULT 'supply'
                      CHECK (item_type IN ('supply','ingredient','material','retail_stock','tool','equipment','packaging','utensil','cleaning','other')),
  unit                text        NOT NULL DEFAULT 'unit',
  current_quantity    numeric     NOT NULL DEFAULT 0,
  reorder_point       numeric     NOT NULL DEFAULT 0,
  target_quantity     numeric,
  cost_per_unit       numeric,
  supplier_name       text,
  supplier_url        text,
  supplier_phone      text,
  supplier_email      text,
  storage_location    text,
  image_url           text,
  is_active           boolean     NOT NULL DEFAULT true,
  is_sellable         boolean     NOT NULL DEFAULT false,
  linked_product_id   uuid        REFERENCES public.products(id) ON DELETE SET NULL,
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. inventory_movements ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inventory_item_id   uuid        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  movement_type       text        NOT NULL
                      CHECK (movement_type IN ('manual_adjustment','sale','return','restock','waste','damage','transfer','count_correction','barcode_scan','system_prediction','other')),
  quantity_delta      numeric     NOT NULL,
  quantity_before     numeric,
  quantity_after      numeric,
  reason              text,
  source_type         text,
  source_id           uuid,
  order_id            uuid,
  product_id          uuid        REFERENCES public.products(id) ON DELETE SET NULL,
  scanned_barcode     text,
  notes               text,
  created_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 3. inventory_alerts ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_alerts (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inventory_item_id           uuid        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  alert_type                  text        NOT NULL
                              CHECK (alert_type IN ('low_stock','out_of_stock','predicted_stockout','overstock','stale_inventory','manual')),
  severity                    text        NOT NULL DEFAULT 'medium'
                              CHECK (severity IN ('low','medium','high','critical')),
  title                       text        NOT NULL,
  message                     text,
  status                      text        NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  recommended_order_quantity  numeric,
  predicted_stockout_at       timestamptz,
  sales_velocity_daily        numeric,
  metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  resolved_at                 timestamptz,
  resolved_by                 uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ── 4. inventory_scan_events ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_scan_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  barcode             text        NOT NULL,
  inventory_item_id   uuid        REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  scan_action         text        NOT NULL DEFAULT 'lookup'
                      CHECK (scan_action IN ('lookup','restock','consume','adjust','count','link_item','create_item')),
  quantity            numeric     NOT NULL DEFAULT 1,
  result              text,
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 5. inventory_settings ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_settings (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  low_stock_alerts_enabled    boolean     NOT NULL DEFAULT true,
  prediction_alerts_enabled   boolean     NOT NULL DEFAULT true,
  default_prediction_days     integer     NOT NULL DEFAULT 14,
  barcode_mode                text        NOT NULL DEFAULT 'camera'
                              CHECK (barcode_mode IN ('camera','manual','both')),
  auto_create_alerts          boolean     NOT NULL DEFAULT true,
  notify_email                boolean     NOT NULL DEFAULT true,
  notify_dashboard            boolean     NOT NULL DEFAULT true,
  settings                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS inventory_settings_updated_at ON public.inventory_settings;
CREATE TRIGGER inventory_settings_updated_at
  BEFORE UPDATE ON public.inventory_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 6. product_inventory_links ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_inventory_links (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id            uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  inventory_item_id     uuid        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity_per_product  numeric     NOT NULL DEFAULT 1,
  deduct_on_sale        boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id, inventory_item_id)
);

DROP TRIGGER IF EXISTS product_inventory_links_updated_at ON public.product_inventory_links;
CREATE TRIGGER product_inventory_links_updated_at
  BEFORE UPDATE ON public.product_inventory_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_inv_items_tenant
  ON public.inventory_items (tenant_id);

CREATE INDEX IF NOT EXISTS idx_inv_items_tenant_barcode
  ON public.inventory_items (tenant_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_items_tenant_sku
  ON public.inventory_items (tenant_id, sku)
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_items_tenant_category
  ON public.inventory_items (tenant_id, category)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_items_tenant_type
  ON public.inventory_items (tenant_id, item_type);

CREATE INDEX IF NOT EXISTS idx_inv_items_tenant_product
  ON public.inventory_items (tenant_id, linked_product_id)
  WHERE linked_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_movements_item_date
  ON public.inventory_movements (tenant_id, inventory_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_movements_type_date
  ON public.inventory_movements (tenant_id, movement_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_alerts_status
  ON public.inventory_alerts (tenant_id, status, severity);

CREATE INDEX IF NOT EXISTS idx_inv_alerts_item
  ON public.inventory_alerts (tenant_id, inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_inv_scan_events_barcode
  ON public.inventory_scan_events (tenant_id, barcode, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prod_inv_links_product
  ON public.product_inventory_links (tenant_id, product_id);

CREATE INDEX IF NOT EXISTS idx_prod_inv_links_item
  ON public.product_inventory_links (tenant_id, inventory_item_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.inventory_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_scan_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_inventory_links ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "service_role_all_inventory_items"
  ON public.inventory_items FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_inventory_movements"
  ON public.inventory_movements FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_inventory_alerts"
  ON public.inventory_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_inventory_scan_events"
  ON public.inventory_scan_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_inventory_settings"
  ON public.inventory_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_product_inventory_links"
  ON public.product_inventory_links FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Platform owner bypass (all tenants)
CREATE POLICY "owner_all_inventory_items" ON public.inventory_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active'));

CREATE POLICY "owner_all_inventory_movements" ON public.inventory_movements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active'));

CREATE POLICY "owner_all_inventory_alerts" ON public.inventory_alerts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active'));

CREATE POLICY "owner_all_inventory_scan_events" ON public.inventory_scan_events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active'));

CREATE POLICY "owner_all_inventory_settings" ON public.inventory_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active'));

CREATE POLICY "owner_all_product_inventory_links" ON public.product_inventory_links
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.role = 'owner' AND u.status = 'active'));

-- Admin/staff read their own tenant's inventory
CREATE POLICY "tenant_read_inventory_items" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','staff','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

-- Admin/staff write inventory_items (admin/manager only for delete)
CREATE POLICY "admin_write_inventory_items" ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

CREATE POLICY "admin_update_inventory_items" ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

CREATE POLICY "admin_delete_inventory_items" ON public.inventory_items
  FOR DELETE TO authenticated
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

-- Movements: tenant read, admin+staff create, no delete from client
CREATE POLICY "tenant_read_inventory_movements" ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','staff','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

CREATE POLICY "tenant_insert_inventory_movements" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','staff','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

-- Alerts: tenant read, admin write
CREATE POLICY "tenant_read_inventory_alerts" ON public.inventory_alerts
  FOR SELECT TO authenticated
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','staff','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

CREATE POLICY "admin_write_inventory_alerts" ON public.inventory_alerts
  FOR ALL TO authenticated
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

-- Scan events: tenant read, staff+ insert
CREATE POLICY "tenant_read_inventory_scan_events" ON public.inventory_scan_events
  FOR SELECT TO authenticated
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','staff','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

CREATE POLICY "tenant_insert_inventory_scan_events" ON public.inventory_scan_events
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','staff','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

-- Settings: tenant admin only
CREATE POLICY "admin_all_inventory_settings" ON public.inventory_settings
  FOR ALL TO authenticated
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

-- Product links: tenant read, admin write
CREATE POLICY "tenant_read_product_inventory_links" ON public.product_inventory_links
  FOR SELECT TO authenticated
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','staff','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

CREATE POLICY "admin_write_product_inventory_links" ON public.product_inventory_links
  FOR ALL TO authenticated
  USING (
    tenant_id = (
      SELECT u.tenant_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin','manager')
        AND u.status = 'active'
      LIMIT 1
    )
  );

-- ── RPC: Dashboard Stats ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_inventory_dashboard_stats(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_total_items             bigint;
  v_low_stock_count         bigint;
  v_out_of_stock_count      bigint;
  v_open_alerts_count       bigint;
  v_estimated_value         numeric;
  v_top_consumed            jsonb;
  v_recent_movements        jsonb;
BEGIN
  -- Total active items
  SELECT COUNT(*) INTO v_total_items
  FROM public.inventory_items
  WHERE tenant_id = p_tenant_id AND is_active = true;

  -- Low stock (quantity > 0 AND quantity <= reorder_point)
  SELECT COUNT(*) INTO v_low_stock_count
  FROM public.inventory_items
  WHERE tenant_id = p_tenant_id
    AND is_active = true
    AND current_quantity > 0
    AND current_quantity <= reorder_point;

  -- Out of stock
  SELECT COUNT(*) INTO v_out_of_stock_count
  FROM public.inventory_items
  WHERE tenant_id = p_tenant_id
    AND is_active = true
    AND current_quantity <= 0;

  -- Open alerts
  SELECT COUNT(*) INTO v_open_alerts_count
  FROM public.inventory_alerts
  WHERE tenant_id = p_tenant_id
    AND status IN ('open','acknowledged');

  -- Estimated inventory value
  SELECT COALESCE(SUM(current_quantity * COALESCE(cost_per_unit, 0)), 0)
  INTO v_estimated_value
  FROM public.inventory_items
  WHERE tenant_id = p_tenant_id AND is_active = true;

  -- Top 5 consumed items (last 30 days)
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_top_consumed
  FROM (
    SELECT
      ii.id,
      ii.name,
      ii.unit,
      ABS(SUM(m.quantity_delta)) AS total_consumed
    FROM public.inventory_movements m
    JOIN public.inventory_items ii ON ii.id = m.inventory_item_id
    WHERE m.tenant_id = p_tenant_id
      AND m.movement_type IN ('sale','consume','waste','damage')
      AND m.quantity_delta < 0
      AND m.created_at >= now() - interval '30 days'
    GROUP BY ii.id, ii.name, ii.unit
    ORDER BY total_consumed DESC
    LIMIT 5
  ) x;

  -- Recent 10 movements
  SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_recent_movements
  FROM (
    SELECT
      m.id,
      m.movement_type,
      m.quantity_delta,
      m.quantity_after,
      m.reason,
      m.created_at,
      ii.name AS item_name,
      ii.unit
    FROM public.inventory_movements m
    JOIN public.inventory_items ii ON ii.id = m.inventory_item_id
    WHERE m.tenant_id = p_tenant_id
    ORDER BY m.created_at DESC
    LIMIT 10
  ) x;

  RETURN jsonb_build_object(
    'total_items',              v_total_items,
    'low_stock_count',          v_low_stock_count,
    'out_of_stock_count',       v_out_of_stock_count,
    'open_alerts_count',        v_open_alerts_count,
    'estimated_inventory_value', v_estimated_value,
    'top_consumed_items',       v_top_consumed,
    'recent_movements',         v_recent_movements
  );
END;
$$;

-- ── RPC: Recalculate Alerts ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recalculate_inventory_alerts(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_item          record;
  v_alert_type    text;
  v_severity      text;
  v_title         text;
  v_message       text;
  v_created_count integer := 0;
  v_resolved_count integer := 0;
BEGIN
  FOR v_item IN
    SELECT id, name, current_quantity, reorder_point, unit
    FROM public.inventory_items
    WHERE tenant_id = p_tenant_id AND is_active = true
  LOOP
    -- Determine alert type
    IF v_item.current_quantity <= 0 THEN
      v_alert_type := 'out_of_stock';
      v_severity   := 'critical';
      v_title      := 'Out of Stock: ' || v_item.name;
      v_message    := v_item.name || ' has 0 units remaining.';
    ELSIF v_item.current_quantity <= v_item.reorder_point THEN
      v_alert_type := 'low_stock';
      v_severity   := CASE
        WHEN v_item.current_quantity <= (v_item.reorder_point * 0.5) THEN 'high'
        ELSE 'medium'
      END;
      v_title      := 'Low Stock: ' || v_item.name;
      v_message    := v_item.name || ' has ' || v_item.current_quantity || ' ' || v_item.unit || ' remaining (reorder at ' || v_item.reorder_point || ').';
    ELSE
      v_alert_type := NULL;
    END IF;

    IF v_alert_type IS NOT NULL THEN
      -- Upsert: insert if no open alert of this type for this item
      IF NOT EXISTS (
        SELECT 1 FROM public.inventory_alerts
        WHERE tenant_id = p_tenant_id
          AND inventory_item_id = v_item.id
          AND alert_type = v_alert_type
          AND status IN ('open','acknowledged')
      ) THEN
        INSERT INTO public.inventory_alerts (
          tenant_id, inventory_item_id, alert_type, severity, title, message, status
        ) VALUES (
          p_tenant_id, v_item.id, v_alert_type, v_severity, v_title, v_message, 'open'
        );
        v_created_count := v_created_count + 1;
      END IF;
    ELSE
      -- Resolve any open low_stock/out_of_stock alerts for this item
      UPDATE public.inventory_alerts
      SET status = 'resolved', resolved_at = now()
      WHERE tenant_id = p_tenant_id
        AND inventory_item_id = v_item.id
        AND alert_type IN ('low_stock','out_of_stock')
        AND status IN ('open','acknowledged');
      IF FOUND THEN
        v_resolved_count := v_resolved_count + GREATEST(0, (SELECT COUNT(*) FROM public.inventory_alerts
          WHERE tenant_id = p_tenant_id AND inventory_item_id = v_item.id
          AND alert_type IN ('low_stock','out_of_stock') AND status = 'resolved' LIMIT 10));
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created_count,
    'resolved', v_resolved_count
  );
END;
$$;

-- ── Grant execute on RPCs ─────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_inventory_dashboard_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_inventory_alerts(uuid) TO authenticated;

-- ── Notify ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE 'Migration 064: Inventory Module tables created.';
END $$;
