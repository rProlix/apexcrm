// app/api/pos/modifier-groups/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin','owner','manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = ['name','description','selection_type','min_required','max_allowed','is_required','applies_to_all_products','sort_order','status']
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) update[k] = body[k]

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_modifier_groups')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin','owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getPOSClient()
  const { error } = await supabase
    .from('pos_modifier_groups')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ archived: true })
}
