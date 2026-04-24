-- supabase/migrations/005_ecommerce.sql
-- Ecommerce / Store module: products, product_images, orders, order_items
-- All tables are scoped by tenant_id. RLS enforces tenant isolation.
-- API routes use the service-role client (bypasses RLS) and enforce RBAC in code.

-- ─────────────────────────────────────────────────────────────────────────────
-- Products
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  description     text,
  price           numeric     NOT NULL CHECK (price >= 0),
  currency        text        NOT NULL DEFAULT 'USD',
  inventory_count integer     NOT NULL DEFAULT 0,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_tenant_id_idx ON products(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Product Images
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_images (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_images_tenant_id_idx  ON product_images(tenant_id);
CREATE INDEX IF NOT EXISTS product_images_product_id_idx ON product_images(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Orders
-- customer_id references customers.id (the portal customer record)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id  uuid        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending',
  total_amount numeric,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_status_check CHECK (
    status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
  )
);

CREATE INDEX IF NOT EXISTS orders_tenant_id_idx   ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Order Items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id   uuid    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid    REFERENCES products(id),
  quantity   integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price      numeric NOT NULL CHECK (price >= 0)
);

CREATE INDEX IF NOT EXISTS order_items_tenant_id_idx ON order_items(tenant_id);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx  ON order_items(order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items    ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS (matches existing pattern in initial_schema.sql)
CREATE POLICY service_role_all ON products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON product_images
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_all ON order_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── products: admin/owner manage; customers read active only ─────────────────
CREATE POLICY products_admin_manage ON products
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  );

CREATE POLICY products_owner_override ON products
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY products_customer_read ON products
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );

-- ── product_images: admin/owner + customer read ──────────────────────────────
CREATE POLICY product_images_admin_manage ON product_images
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  );

CREATE POLICY product_images_customer_read ON product_images
  FOR SELECT TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
  );

-- ── orders: admin/owner see all tenant orders; customers see own orders ───────
CREATE POLICY orders_admin_access ON orders
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  );

CREATE POLICY orders_owner_override ON orders
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY orders_customer_own ON orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

-- ── order_items: admin/owner + customer via their own orders ─────────────────
CREATE POLICY order_items_admin_access ON order_items
  FOR ALL TO authenticated
  USING (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  )
  WITH CHECK (
    tenant_id::text = (auth.jwt() ->> 'tenant_id')
    AND (auth.jwt() ->> 'role') IN ('admin', 'owner')
  );

CREATE POLICY order_items_owner_override ON order_items
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

CREATE POLICY order_items_customer_own ON order_items
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper function: decrement product inventory atomically
-- Called by the orders API after a successful order is placed.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decrement_product_inventory(
  p_product_id uuid,
  p_quantity   integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products
  SET    inventory_count = GREATEST(0, inventory_count - p_quantity)
  WHERE  id = p_product_id;
END;
$$;
