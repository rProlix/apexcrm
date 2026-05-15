export const dynamic = 'force-dynamic'

// app/(dashboard)/pos/orders/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { POSOrdersList } from '@/components/pos/POSOrdersList'

export const metadata = { title: 'POS Orders' }

export default async function POSOrdersPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager', 'staff'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'pos', ctx.role)
  }

  const supabase  = getPOSClient()
  const tenantId  = ctx.tenant_id ?? ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: orders } = await supabase
    .from('pos_orders')
    .select('id,order_number,status,payment_status,total_cents,created_at,table_name,customer_id,customers(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <POSOrdersList
      tenantId={tenantId}
      initialOrders={(orders ?? []).map((o: Record<string, unknown>) => ({
        ...o,
        customer_name: (o.customers as { name?: string } | null)?.name ?? null,
        customers: undefined,
      }))}
    />
  )
}
