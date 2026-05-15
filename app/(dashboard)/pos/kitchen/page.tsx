export const dynamic = 'force-dynamic'

// app/(dashboard)/pos/kitchen/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { POSKitchenDisplay } from '@/components/pos/POSKitchenDisplay'

export const metadata = { title: 'Kitchen Display — POS' }

export default async function POSKitchenPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager', 'staff'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'pos', ctx.role)
  }

  const supabase = getPOSClient()
  const tenantId = ctx.tenant_id ?? ''

  const { data: tickets } = await supabase
    .from('pos_kitchen_tickets')
    .select(`*, pos_orders(id, order_number, order_type, table_name, guest_count, notes, kitchen_notes, pos_order_items(id, name, quantity, notes, kitchen_notes, fulfillment_status, pos_order_item_modifiers(id, name, modifier_type, quantity)))`)
    .eq('tenant_id', tenantId)
    .in('status', ['new', 'accepted', 'preparing', 'ready'])
    .order('sent_at', { ascending: true })

  return (
    <POSKitchenDisplay
      tenantId={tenantId}
      initialTickets={tickets ?? []}
    />
  )
}
