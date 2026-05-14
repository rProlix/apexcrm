// app/api/inventory/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

// ── GET /api/inventory/settings ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('inventory_settings')
    .select('*')
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return defaults if no settings row yet
  if (!data) {
    return NextResponse.json({
      settings: {
        tenant_id:                  user.tenant_id,
        low_stock_alerts_enabled:   true,
        prediction_alerts_enabled:  true,
        default_prediction_days:    14,
        barcode_mode:               'camera',
        auto_create_alerts:         true,
        notify_email:               true,
        notify_dashboard:           true,
        settings:                   {},
      },
    })
  }

  return NextResponse.json({ settings: data })
}

// ── PATCH /api/inventory/settings ─────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'owner', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = [
    'low_stock_alerts_enabled',
    'prediction_alerts_enabled',
    'default_prediction_days',
    'barcode_mode',
    'auto_create_alerts',
    'notify_email',
    'notify_dashboard',
    'settings',
  ]
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('inventory_settings')
    .upsert({ tenant_id: user.tenant_id, ...patch })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}
