// app/api/payments/charge/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { chargeCustomer } from '@/lib/payments/chargeCustomer'

// ── POST /api/payments/charge ─────────────────────────────────────────────────
// Admin charges a customer directly (manual charge or source token provided)
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized — admin required' }, { status: 401 })
  }

  const tenantId = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { customer_id, invoice_id, amount, currency, description, source, provider_key } = body

  const parsedAmount = Number(amount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  try {
    const result = await chargeCustomer({
      tenantId,
      customerId:  customer_id  as string | undefined,
      invoiceId:   invoice_id   as string | undefined,
      amount:      parsedAmount,
      currency:    currency      as string | undefined,
      description: description   as string | undefined,
      source:      source        as string | undefined,
      providerKey: provider_key  as string | undefined,
    })

    return NextResponse.json({ charge: result }, { status: 201 })
  } catch (err) {
    const msg = (err as Error).message
    const isUserErr = msg.includes('No payment provider') || msg.includes('Invoice') || msg.includes('Amount')
    return NextResponse.json({ error: msg }, { status: isUserErr ? 400 : 500 })
  }
}
