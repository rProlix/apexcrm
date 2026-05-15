// app/api/pos/shifts/route.ts — POST opens a new shift
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_shifts')
    .select('*, pos_registers(name)')
    .eq('tenant_id', user.tenant_id)
    .order('opened_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shifts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = getPOSClient()

  // Check no open shift already exists for this register
  if (body.register_id) {
    const { data: existing } = await supabase
      .from('pos_shifts')
      .select('id')
      .eq('tenant_id', user.tenant_id)
      .eq('register_id', body.register_id)
      .eq('status', 'open')
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'A shift is already open for this register' }, { status: 400 })
    }
  }

  const startingCash = typeof body.starting_cash_cents === 'number' ? body.starting_cash_cents : 0
  const { data, error } = await supabase
    .from('pos_shifts')
    .insert({
      tenant_id:          user.tenant_id,
      register_id:        body.register_id ?? null,
      opened_by:          user.id,
      starting_cash_cents: startingCash,
      expected_cash_cents: startingCash,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update register current_cash
  if (body.register_id) {
    await supabase.from('pos_registers')
      .update({ current_cash_cents: startingCash })
      .eq('id', body.register_id)
      .eq('tenant_id', user.tenant_id)
  }

  return NextResponse.json({ shift: data }, { status: 201 })
}
