// app/api/pos/registers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_registers')
    .select('*, pos_shifts(id, status, opened_at, opened_by)')
    .eq('tenant_id', user.tenant_id)
    .neq('status', 'archived')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ registers: data ?? [] })
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

  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_registers')
    .insert({
      tenant_id:             user.tenant_id,
      name:                  body.name,
      location_name:         body.location_name ?? null,
      register_code:         body.register_code ?? null,
      cash_tracking_enabled: body.cash_tracking_enabled ?? false,
      starting_cash_cents:   body.starting_cash_cents ?? 0,
      created_by:            user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ register: data }, { status: 201 })
}
