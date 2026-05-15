// app/api/pos/shifts/[id]/route.ts — PATCH to close a shift
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: shiftId } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = getPOSClient()

  const { data: shift } = await supabase
    .from('pos_shifts')
    .select('id, status, starting_cash_cents, register_id')
    .eq('id', shiftId)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
  if (shift.status !== 'open') return NextResponse.json({ error: 'Shift is not open' }, { status: 400 })

  // Calculate expected cash from payments during this shift
  const { data: payments } = await supabase
    .from('pos_payments')
    .select('amount_cents')
    .eq('tenant_id', user.tenant_id)
    .eq('payment_method', 'cash')
    .eq('status', 'paid')

  const cashPayments = (payments ?? []).reduce((s: number, p: { amount_cents: number }) => s + p.amount_cents, 0)
  const expectedCash = shift.starting_cash_cents + cashPayments
  const countedCash  = typeof body.counted_cash_cents === 'number' ? body.counted_cash_cents : null
  const difference   = countedCash !== null ? countedCash - expectedCash : null

  const { data, error } = await supabase
    .from('pos_shifts')
    .update({
      status:               'closed',
      closed_by:            user.id,
      closed_at:            new Date().toISOString(),
      expected_cash_cents:  expectedCash,
      counted_cash_cents:   countedCash,
      cash_difference_cents: difference,
      notes:                body.notes ?? null,
    })
    .eq('id', shiftId)
    .eq('tenant_id', user.tenant_id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shift: data })
}
