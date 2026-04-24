// app/api/payments/transactions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// ── GET /api/payments/transactions/[id] ──────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const dashUser = await resolveStoreUser(req)
  if (dashUser && ['admin', 'owner'].includes(dashUser.role)) {
    const { data, error } = await supabase
      .from('payment_transactions')
      .select('*, payment_refunds(*)')
      .eq('id', params.id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (dashUser.role !== 'owner' && data.tenant_id !== dashUser.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ transaction: data })
  }

  // Customer: own transaction only
  const customer = await resolveStoreCustomer(req)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('id', params.id)
    .eq('tenant_id', customer.tenant_id)
    .eq('customer_id', customer.customer_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ transaction: data })
}
