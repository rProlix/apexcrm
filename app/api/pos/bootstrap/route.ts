// app/api/pos/bootstrap/route.ts
// Returns all data needed to initialize the POS screen in one request.
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = user.tenant_id
  const supabase = getPOSClient()

  // Verify POS module enabled
  const { data: moduleRow } = await supabase
    .from('tenant_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('module_key', 'pos')
    .maybeSingle()

  if (user.role !== 'owner' && !moduleRow?.enabled) {
    return NextResponse.json({ error: 'POS module not enabled' }, { status: 403 })
  }

  const [
    { data: settings },
    { data: products },
    { data: modifierGroups },
    { data: activeShift },
    { data: registers },
    { data: discounts },
    { data: paymentProviders },
  ] = await Promise.all([
    supabase.from('pos_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('products').select('id,name,description,price,currency,inventory_count,is_active').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
    supabase.from('pos_modifier_groups').select(`*, pos_modifiers(*)`).eq('tenant_id', tenantId).eq('status', 'active').order('sort_order'),
    supabase.from('pos_shifts').select('*').eq('tenant_id', tenantId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('pos_registers').select('*').eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('pos_discounts').select('*').eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('payment_providers').select('provider_key,is_enabled,is_default').eq('tenant_id', tenantId).eq('is_enabled', true),
  ])

  // Get product modifier group links
  const productIds = (products ?? []).map((p: { id: string }) => p.id)
  const { data: productModLinks } = productIds.length > 0
    ? await supabase.from('pos_product_modifier_groups').select('product_id, modifier_group_id, sort_order').in('product_id', productIds).eq('tenant_id', tenantId)
    : { data: [] }

  const groupsById = new Map((modifierGroups ?? []).map((g: Record<string, unknown>) => [g.id, g]))

  const productsWithModifiers = (products ?? []).map((p: Record<string, unknown>) => {
    const links = (productModLinks ?? [])
      .filter((l: { product_id: string }) => l.product_id === p.id)
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
    const modGroups = links.map((l: { modifier_group_id: string }) => groupsById.get(l.modifier_group_id)).filter(Boolean)

    // Also include groups that apply_to_all_products
    const globalGroups = (modifierGroups ?? []).filter((g: { applies_to_all_products: boolean }) => g.applies_to_all_products)
    const allGroups = [...modGroups, ...globalGroups.filter((g: { id: string }) => !modGroups.some((mg: { id: string } | undefined) => mg && mg.id === g.id))]

    return { ...p, modifier_groups: allGroups, price_cents: Math.round(Number(p.price) * 100) }
  })

  return NextResponse.json({
    settings:          settings ?? null,
    products:          productsWithModifiers,
    modifier_groups:   modifierGroups ?? [],
    active_shift:      activeShift ?? null,
    registers:         registers ?? [],
    discounts:         discounts ?? [],
    payment_providers: paymentProviders ?? [],
    enabled_modules: {
      inventory: true, // will be checked separately, for now assume enabled
    },
  })
}
