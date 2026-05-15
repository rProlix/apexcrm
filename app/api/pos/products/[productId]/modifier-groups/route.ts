// app/api/pos/products/[productId]/modifier-groups/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

type Params = { params: Promise<{ productId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { productId } = await params
  const supabase = getPOSClient()

  const { data, error } = await supabase
    .from('pos_product_modifier_groups')
    .select(`*, pos_modifier_groups(*, pos_modifiers(*))`)
    .eq('tenant_id', user.tenant_id)
    .eq('product_id', productId)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ links: data ?? [] })
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin','owner','manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { productId } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.modifier_group_id) return NextResponse.json({ error: 'modifier_group_id required' }, { status: 400 })

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_product_modifier_groups')
    .upsert({
      tenant_id:         user.tenant_id,
      product_id:        productId,
      modifier_group_id: body.modifier_group_id,
      sort_order:        body.sort_order ?? 0,
    }, { onConflict: 'tenant_id,product_id,modifier_group_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ link: data }, { status: 201 })
}
