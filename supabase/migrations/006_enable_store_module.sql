-- supabase/migrations/006_enable_store_module.sql
-- Backfill: enable the "store" module for every existing active tenant
-- that does not already have a tenant_modules row for it.

INSERT INTO tenant_modules (tenant_id, module_key, enabled, config)
SELECT
  t.id,
  'store',
  true,
  '{}'::jsonb
FROM tenants t
WHERE t.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM   tenant_modules tm
    WHERE  tm.tenant_id  = t.id
      AND  tm.module_key = 'store'
  );
