// app/api/owner/diagnostics/pos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin','owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getPOSClient()
  const checks: Record<string, { ok: boolean; detail?: string }> = {}

  // Check POS tables exist
  for (const table of ['pos_orders','pos_order_items','pos_settings','pos_registers','pos_kitchen_tickets']) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1)
      checks[`table_${table}`] = { ok: !error, detail: error?.message }
    } catch (e) {
      checks[`table_${table}`] = { ok: false, detail: String(e) }
    }
  }

  // POS module registered
  const { data: moduleRow } = await supabase
    .from('tenant_modules')
    .select('enabled')
    .eq('tenant_id', user.tenant_id)
    .eq('module_key', 'pos')
    .maybeSingle()
  checks['pos_module_enabled'] = { ok: !!moduleRow?.enabled }

  // POS settings row exists
  const { data: settings } = await supabase
    .from('pos_settings')
    .select('id')
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()
  checks['pos_settings_exists'] = { ok: !!settings }

  // Payment providers configured
  const { data: providers } = await supabase
    .from('payment_providers')
    .select('provider_key, is_enabled')
    .eq('tenant_id', user.tenant_id)
    .eq('is_enabled', true)
  checks['payment_providers_configured'] = {
    ok: (providers ?? []).length > 0,
    detail: (providers ?? []).map((p: { provider_key: string }) => p.provider_key).join(', ') || 'none',
  }

  // Store products available
  const { count: productCount } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', user.tenant_id)
    .eq('is_active', true)
  checks['store_products_available'] = { ok: (productCount ?? 0) > 0, detail: `${productCount ?? 0} active products` }

  // Inventory module
  const { data: invModule } = await supabase
    .from('tenant_modules')
    .select('enabled')
    .eq('tenant_id', user.tenant_id)
    .eq('module_key', 'inventory')
    .maybeSingle()
  checks['inventory_module_enabled'] = { ok: !!invModule?.enabled }

  // Env vars (without exposing values)
  checks['supabase_url'] = { ok: !!process.env.NEXT_PUBLIC_SUPABASE_URL }
  checks['supabase_anon_key'] = { ok: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }

  const allOk = Object.values(checks).every((c) => c.ok)

  return NextResponse.json({ ok: allOk, checks })
}
