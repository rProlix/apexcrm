export const dynamic = 'force-dynamic'

// app/(dashboard)/pos/orders/[id]/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { POSOrderDetail } from '@/components/pos/POSOrderDetail'
import { notFound } from 'next/navigation'

export const metadata = { title: 'POS Order Detail' }

type Props = { params: Promise<{ id: string }> }

export default async function POSOrderDetailPage({ params }: Props) {
  const ctx = await requireRole(['owner', 'admin', 'manager', 'staff'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'pos', ctx.role)
  }

  const { id } = await params
  const supabase = getPOSClient()
  const tenantId = ctx.tenant_id ?? ''

  const { data: order } = await supabase
    .from('pos_orders')
    .select(`
      *,
      customers(name,email,phone),
      pos_order_items(*, pos_order_item_modifiers(*)),
      pos_payments(*),
      pos_order_events(*),
      pos_refunds(*)
    `)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (!order) notFound()

  return (
    <POSOrderDetail
      order={order as Record<string, unknown>}
      tenantId={tenantId}
      userRole={ctx.role}
    />
  )
}
