// app/api/customers/[id]/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { hasPermission } from '@/lib/auth/permissions'
import { getCustomerOrders } from '@/lib/customers/getCustomerOrders'
import { getCustomerContext } from '@/lib/auth/customerGuard'
import { headers } from 'next/headers'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/customers/[id]/orders ──────────────────────────────────────────
// admin → customer's orders within their tenant
// customer → only their own orders
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 100)

  // Dashboard user (admin/owner)
  const ctx = await getUserContext()
  if (ctx && hasPermission(ctx.role, 'view_customers')) {
    const tenantId = ctx.tenant_id
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

    const orders = await getCustomerOrders(tenantId, id, limit)
    return NextResponse.json({ orders })
  }

  // Customer portal — can only view their own orders
  const host = (await headers()).get('host') ?? ''
  const customerCtx = await getCustomerContext(host)
  if (customerCtx && customerCtx.customer_id === id) {
    const orders = await getCustomerOrders(customerCtx.tenant_id, id, limit)
    return NextResponse.json({ orders })
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
