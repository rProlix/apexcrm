import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL(
  '../../../supabase/migrations/20260727130000_inspection_compliance_comparison_repair.sql',
  import.meta.url
)

test('workflow schema is tenant-scoped, RLS protected, and human-confirmed', async () => {
  const sql = await fs.readFile(migrationUrl, 'utf8')
  for (const table of [
    'van_inspection_schedules',
    'van_damage_comparison_runs',
    'van_damage_comparison_pairs',
    'van_damage_comparison_findings',
    'van_damage_repairs',
    'van_damage_repair_verifications',
    'van_damage_repair_verification_images',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`))
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /Cross-tenant workflow reference rejected/)
  assert.match(sql, /prevent_automated_repair_confirmation/)
  assert.match(sql, /human_decision = 'confirm_repaired'/)
  assert.doesNotMatch(sql, /signed_url|gemini/i)
})
