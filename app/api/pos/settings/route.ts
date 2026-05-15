// app/api/pos/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_settings')
    .select('*')
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data ?? null })
}

export async function PATCH(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin','owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = [
    'default_tax_rate','tips_enabled','service_fee_enabled','service_fee_percent',
    'require_customer_for_order','allow_custom_items','allow_item_notes',
    'allow_kitchen_notes','allow_discounts','manager_approval_for_discounts',
    'inventory_deduction_timing','order_number_prefix','receipt_branding',
  ]

  const update: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) update[k] = body[k]

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_settings')
    .upsert({ tenant_id: user.tenant_id, ...update }, { onConflict: 'tenant_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}
