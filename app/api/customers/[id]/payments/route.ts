// app/api/customers/[id]/payments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { hasPermission } from '@/lib/auth/permissions'
import { getCustomerPayments } from '@/lib/customers/getCustomerPayments'
import { getCustomerContext } from '@/lib/auth/customerGuard'
import { headers } from 'next/headers'

type Params = { params: { id: string } }

// ─── GET /api/customers/[id]/payments ────────────────────────────────────────
// admin → customer's payments (transactions + invoices) within their tenant
// customer → only their own payments
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = params
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 100)

  // Dashboard user
  const ctx = await getUserContext()
  if (ctx && hasPermission(ctx.role, 'view_customers')) {
    const tenantId = ctx.tenant_id
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

    const payments = await getCustomerPayments(tenantId, id, limit)
    return NextResponse.json(payments)
  }

  // Customer portal
  const host = (await headers()).get('host') ?? ''
  const customerCtx = await getCustomerContext(host)
  if (customerCtx && customerCtx.customer_id === id) {
    const payments = await getCustomerPayments(customerCtx.tenant_id, id, limit)
    return NextResponse.json(payments)
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
