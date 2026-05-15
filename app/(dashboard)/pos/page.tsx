export const dynamic = 'force-dynamic'

// app/(dashboard)/pos/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { POSScreen } from '@/components/pos/POSScreen'

export const metadata = { title: 'Point of Sale — POS' }

export default async function POSPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager', 'staff'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'pos', ctx.role)
  }

  const supabase  = getPOSClient()
  const tenantId  = ctx.tenant_id ?? ''

  const [
    { data: settings },
    { data: products },
    { data: modifierGroups },
    { data: activeShift },
    { data: registers },
    { data: discounts },
  ] = await Promise.all([
    supabase.from('pos_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('products').select('id,name,description,price,currency,inventory_count,is_active,category').eq('tenant_id', tenantId).eq('is_active', true).order('name').limit(500),
    supabase.from('pos_modifier_groups').select(`id,name,description,selection_type,min_required,max_allowed,is_required,applies_to_all_products,sort_order,pos_modifiers(id,name,modifier_type,price_delta_cents,is_default,sort_order,status)`).eq('tenant_id', tenantId).eq('status', 'active').order('sort_order'),
    supabase.from('pos_shifts').select('*').eq('tenant_id', tenantId).eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('pos_registers').select('id,name,location_name').eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('pos_discounts').select('*').eq('tenant_id', tenantId).eq('status', 'active'),
  ])

  // Attach modifier groups to products
  const productIds = (products ?? []).map((p: { id: string }) => p.id)
  const { data: modLinks } = productIds.length > 0
    ? await supabase.from('pos_product_modifier_groups').select('product_id,modifier_group_id,sort_order').in('product_id', productIds).eq('tenant_id', tenantId)
    : { data: [] }

  const groupsById = new Map((modifierGroups ?? []).map((g: Record<string, unknown>) => [g.id, g]))
  const globalGroups = (modifierGroups ?? []).filter((g: { applies_to_all_products: boolean }) => g.applies_to_all_products)

  const enrichedProducts = (products ?? []).map((p: Record<string, unknown>) => {
    const links = (modLinks ?? []).filter((l: { product_id: string }) => l.product_id === p.id)
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
    const productGroups = links.map((l: { modifier_group_id: string }) => groupsById.get(l.modifier_group_id)).filter(Boolean)
    const allGroups = [...productGroups, ...globalGroups.filter((g: { id: string }) => !productGroups.some((pg: Record<string, unknown> | undefined) => pg && pg.id === g.id))]

    return {
      ...p,
      price_cents: Math.round(Number(p.price) * 100),
      modifier_groups: allGroups,
    }
  })

  return (
    <POSScreen
      tenantId={tenantId}
      userId={ctx.id}
      userRole={ctx.role}
      initialProducts={enrichedProducts as Record<string, unknown>[]}
      initialSettings={settings ?? null}
      initialModifierGroups={modifierGroups ?? []}
      initialShift={activeShift ?? null}
      initialRegisters={registers ?? []}
      initialDiscounts={discounts ?? []}
    />
  )
}
