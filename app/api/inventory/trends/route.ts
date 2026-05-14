// app/api/inventory/trends/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { buildTrendSummary } from '@/lib/inventory/predictions'
import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'

// ── GET /api/inventory/trends ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = user.tenant_id
  const predDays = parseInt(req.nextUrl.searchParams.get('prediction_days') ?? '14', 10)

  // Load tenant settings for prediction days
  const supabase = getSupabaseServerClient()
  const { data: settings } = await supabase
    .from('inventory_settings')
    .select('default_prediction_days')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const days = predDays || settings?.default_prediction_days || 14

  try {
    const summary = await buildTrendSummary(tenantId, days)
    return NextResponse.json({ trends: summary })
  } catch (err) {
    console.error('[GET /api/inventory/trends]', err)
    return NextResponse.json({ error: 'Failed to build trends' }, { status: 500 })
  }
}
