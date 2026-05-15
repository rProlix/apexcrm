// app/api/pos/products/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const category = searchParams.get('category')
  const search   = searchParams.get('search')

  const supabase = getPOSClient()
  let query = supabase
    .from('products')
    .select(`id, name, description, price, currency, inventory_count, is_active, category`)
    .eq('tenant_id', user.tenant_id)
    .eq('is_active', true)
    .order('name')

  if (category) query = query.eq('category', category)
  if (search)   query = query.ilike('name', `%${search}%`)

  const { data: products, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Load modifier group links for these products
  const productIds = (products ?? []).map((p: { id: string }) => p.id)
  let modLinks: Array<{ product_id: string; modifier_group_id: string; sort_order: number }> = []
  let groups: Record<string, unknown>[] = []

  if (productIds.length > 0) {
    const [linksRes, groupsRes] = await Promise.all([
      supabase
        .from('pos_product_modifier_groups')
        .select('product_id, modifier_group_id, sort_order')
        .in('product_id', productIds)
        .eq('tenant_id', user.tenant_id),
      supabase
        .from('pos_modifier_groups')
        .select(`id, name, selection_type, min_required, max_allowed, is_required, sort_order, pos_modifiers(id, name, modifier_type, price_delta_cents, is_default, sort_order, status)`)
        .eq('tenant_id', user.tenant_id)
        .eq('status', 'active'),
    ])
    modLinks = linksRes.data ?? []
    groups   = groupsRes.data ?? []
  }

  const groupsById = new Map(groups.map((g) => [g.id as string, g]))
  const globalGroups = groups.filter((g) => g.applies_to_all_products)

  const enriched = (products ?? []).map((p: Record<string, unknown>) => {
    const links = modLinks
      .filter((l) => l.product_id === p.id)
      .sort((a, b) => a.sort_order - b.sort_order)
    const productGroups = links.map((l) => groupsById.get(l.modifier_group_id)).filter(Boolean)
    const allGroups = [...productGroups, ...globalGroups.filter((g) => !productGroups.some((pg) => pg && (pg as Record<string, unknown>).id === g.id))]

    return {
      ...p,
      price_cents: Math.round(Number(p.price) * 100),
      modifier_groups: allGroups,
    }
  })

  return NextResponse.json({ products: enriched })
}
