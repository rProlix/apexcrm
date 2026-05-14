// app/api/inventory/alerts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

// ── GET /api/inventory/alerts ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status   = searchParams.get('status') ?? ''
  const severity = searchParams.get('severity') ?? ''

  const supabase = getSupabaseServerClient()
  let query = supabase
    .from('inventory_alerts')
    .select(`
      *,
      inventory_items(name, unit, current_quantity)
    `)
    .eq('tenant_id', user.tenant_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status)   query = query.eq('status', status)
  if (severity) query = query.eq('severity', severity)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/inventory/alerts]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten joined data
  type RawAlertRow = Record<string, unknown> & { inventory_items?: { name?: string; unit?: string; current_quantity?: number } | null }
  const alerts = (data ?? []).map((a: RawAlertRow) => {
    const inv = a.inventory_items
    const { inventory_items: _inv, ...rest } = a
    return {
      ...rest,
      item_name:        inv?.name ?? null,
      item_unit:        inv?.unit ?? null,
      current_quantity: inv?.current_quantity ?? null,
    }
  })

  return NextResponse.json({ alerts })
}
