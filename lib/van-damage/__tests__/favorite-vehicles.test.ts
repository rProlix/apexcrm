import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const source = (relativePath: string) => readFile(path.join(process.cwd(), relativePath), 'utf8')

test('favorite vans are durable, tenant scoped, and available as an inspection summary view', async () => {
  const [migration, route, page, list] = await Promise.all([
    source('supabase/migrations/20260801090000_van_damage_favorite_vehicles.sql'),
    source('app/api/van-damage/vehicles/[vehicleId]/favorite/route.ts'),
    source('app/(dashboard)/dashboard/damage-ai/page.tsx'),
    source('components/van-damage/RecentInspectionsList.tsx'),
  ])

  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /PRIMARY KEY \(tenant_id, business_id, vehicle_id\)/)
  assert.match(route, /resolveVanDamageAccess/)
  assert.match(route, /\.eq\('tenant_id', access\.tenantId\)/)
  assert.match(route, /van_damage_favorite_vehicles/)
  assert.match(page, /label: 'Favorites'/)
  assert.match(page, /view: 'favorites'/)
  assert.match(list, /favorite-van-row/)
  assert.match(list, /Favorite van/)
})

test('favorite priority shine is motion safe', async () => {
  const css = await source('app/globals.css')
  assert.match(css, /@keyframes favorite-van-priority-sweep/)
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.favorite-van-row::after[\s\S]*animation: none !important/
  )
})

test('review persistence and workflow are Level 3 only', async () => {
  const [migration, route, worker] = await Promise.all([
    source('supabase/migrations/20260801091000_level3_review_only.sql'),
    source('app/api/van-damage/inspections/[inspectionId]/route.ts'),
    source('workers/van-damage-worker/src/process-job.ts'),
  ])
  assert.match(migration, /ELSIF review_count > 0 THEN[\s\S]*public_status := 'needs_review'/)
  assert.match(route, /Only Level 3 damage requires the review workflow/)
  assert.match(worker, /needsHumanReview: result\.analysis\.damageRating === 3/)
})
