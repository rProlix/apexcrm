// app/api/pos/modifier-groups/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_modifier_groups')
    .select(`*, pos_modifiers(*)`)
    .eq('tenant_id', user.tenant_id)
    .neq('status', 'archived')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ groups: data ?? [] })
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

  if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_modifier_groups')
    .insert({
      tenant_id:              user.tenant_id,
      name:                   body.name,
      description:            body.description ?? null,
      selection_type:         body.selection_type ?? 'multiple',
      min_required:           body.min_required ?? 0,
      max_allowed:            body.max_allowed ?? null,
      is_required:            body.is_required ?? false,
      applies_to_all_products: body.applies_to_all_products ?? false,
      sort_order:             body.sort_order ?? 0,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data }, { status: 201 })
}
