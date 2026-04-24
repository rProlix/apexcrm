// app/api/payments/refunds/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { refundPayment } from '@/lib/payments/refundPayment'

// ── GET /api/payments/refunds ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  const { data, error } = await supabase
    .from('payment_refunds')
    .select('*, payment_transactions(provider_transaction_id, amount, currency)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ refunds: data ?? [] })
}

// ── POST /api/payments/refunds ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { transaction_id, amount, reason } = body

  if (!transaction_id || typeof transaction_id !== 'string') {
    return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
  }

  const parsedAmount = amount != null ? Number(amount) : undefined

  if (parsedAmount !== undefined && (isNaN(parsedAmount) || parsedAmount <= 0)) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  try {
    const result = await refundPayment({
      tenantId,
      transactionId: transaction_id,
      amount:        parsedAmount,
      reason:        reason as string | undefined,
    })

    return NextResponse.json({ refund: result }, { status: 201 })
  } catch (err) {
    const msg = (err as Error).message
    const isUserErr = msg.includes('not found') || msg.includes('Cannot') || msg.includes('exceeds') || msg.includes('enabled')
    return NextResponse.json({ error: msg }, { status: isUserErr ? 400 : 500 })
  }
}
