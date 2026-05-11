// app/api/owner/diagnostics/website-images/repair-aspect-ratios/route.ts
// POST /api/owner/diagnostics/website-images/repair-aspect-ratios
//
// Owner-only. Normalizes all existing website_image_plans rows that have
// invalid aspect_ratio values. Uses the service-role client so it bypasses RLS.
// Equivalent to running migration 059_fix_aspect_ratios.sql but callable at runtime.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeImagenAspectRatio, SUPPORTED_IMAGEN_ASPECT_RATIOS } from '@/lib/website-ai/imagenAspectRatios'

const VALID_RATIOS = [...SUPPORTED_IMAGEN_ASPECT_RATIOS]

export async function POST() {
  const ctx = await getUserContext()
  if (!ctx)              return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner')
    return NextResponse.json({ error: 'Owner role required.' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  // Load all rows with invalid aspect_ratio (fetch in batches up to 1000)
  // Use select('*') and cast to avoid stale generated-types issues
  const { data: allRows, error: fetchErr } = await supabase
    .from('website_image_plans')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (fetchErr) {
    return NextResponse.json({ error: `Failed to fetch plans: ${fetchErr.message}` }, { status: 500 })
  }

  type PlanRow = { id: string; aspect_ratio: string; section_type: string | null; requested_aspect_ratio: string | null }

  const invalidRows = ((allRows ?? []) as unknown as PlanRow[]).filter(
    r => !(VALID_RATIOS as string[]).includes(r.aspect_ratio)
  )

  if (invalidRows.length === 0) {
    return NextResponse.json({
      ok:      true,
      repaired: 0,
      message: 'No rows with invalid aspect_ratio found. Nothing to repair.',
    })
  }

  const repaired: Array<{ id: string; from: string; to: string }> = []
  const failures: Array<{ id: string; error: string }> = []

  for (const row of invalidRows) {
    const normalized = normalizeImagenAspectRatio(row.aspect_ratio, row.section_type)
    const { error: updateErr } = await supabase
      .from('website_image_plans')
      .update({
        aspect_ratio:           normalized,
        requested_aspect_ratio: row.requested_aspect_ratio ?? row.aspect_ratio,
        updated_at:             new Date().toISOString(),
      } as never)
      .eq('id', row.id)

    if (updateErr) {
      failures.push({ id: row.id, error: updateErr.message })
    } else {
      repaired.push({ id: row.id, from: row.aspect_ratio, to: normalized })
    }
  }

  return NextResponse.json({
    ok:        failures.length === 0,
    repaired:  repaired.length,
    failures:  failures.length,
    details:   repaired,
    errors:    failures,
    message:   failures.length === 0
      ? `Repaired ${repaired.length} row(s) with invalid aspect_ratio values.`
      : `Repaired ${repaired.length} row(s). ${failures.length} failed — see errors.`,
  }, { status: failures.length > 0 ? 207 : 200 })
}
