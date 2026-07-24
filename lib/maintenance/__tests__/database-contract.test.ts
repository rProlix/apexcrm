import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Fleet Maintenance uses the authoritative public schema and distinguishes database failure', async () => {
  const [migration, hardening, page, types] = await Promise.all([
    readFile(
      new URL(
        '../../../supabase/migrations/20260723090000_level3_attribution_fleet_maintenance.sql',
        import.meta.url
      ),
      'utf8'
    ),
    readFile(
      new URL(
        '../../../supabase/migrations/20260723130000_fleet_maintenance_query_hardening.sql',
        import.meta.url
      ),
      'utf8'
    ),
    readFile(
      new URL('../../../app/(dashboard)/dashboard/vehicles/maintenance/page.tsx', import.meta.url),
      'utf8'
    ),
    readFile(new URL('../../supabase/types.ts', import.meta.url), 'utf8'),
  ])
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.fleet_maintenance_items/)
  assert.match(migration, /ALTER TABLE public\.fleet_maintenance_items ENABLE ROW LEVEL SECURITY/)
  assert.match(hardening, /NOTIFY pgrst, 'reload schema'/)
  assert.match(page, /\.from\('fleet_maintenance_items'\)/)
  assert.match(page, /We couldn’t load fleet maintenance/)
  assert.match(types, /fleet_maintenance_items:/)
})
