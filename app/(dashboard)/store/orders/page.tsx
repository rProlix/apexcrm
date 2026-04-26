export const dynamic = 'force-dynamic'

// app/(dashboard)/store/orders/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { OrdersClient } from '@/components/store/OrdersClient'

export const metadata = { title: 'Orders — Store' }

export default async function OrdersPage() {
  const ctx = await requireRole(['owner', 'admin'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'store', ctx.role)
  }

  const supabase = getSupabaseServerClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items(id, product_id, quantity, price)')
    .eq('tenant_id', ctx.tenant_id ?? '')
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <OrdersClient initialOrders={(orders ?? []) as any[]} />
}
