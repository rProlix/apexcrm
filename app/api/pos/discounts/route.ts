// app/api/pos/discounts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_discounts')
    .select('*')
    .eq('tenant_id', user.tenant_id)
    .eq('status', 'active')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ discounts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin','owner','manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name || !body.discount_type || body.value === undefined) {
    return NextResponse.json({ error: 'name, discount_type, and value required' }, { status: 400 })
  }

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_discounts')
    .insert({
      tenant_id:                  user.tenant_id,
      name:                       body.name,
      discount_type:              body.discount_type,
      value:                      body.value,
      applies_to:                 body.applies_to ?? 'order',
      requires_manager_approval:  body.requires_manager_approval ?? false,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ discount: data }, { status: 201 })
}
