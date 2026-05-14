export const dynamic = 'force-dynamic'

// app/(dashboard)/inventory/items/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getInventoryClient } from '@/lib/inventory/supabaseInventory'
import { InventoryItemsClient } from '@/components/inventory/InventoryItemsClient'

export const metadata = { title: 'Inventory Items' }

export default async function InventoryItemsPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager', 'staff'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'inventory', ctx.role)
  }

  const supabase = getInventoryClient()
  const { data: items } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('tenant_id', ctx.tenant_id ?? '')
    .eq('is_active', true)
    .order('name', { ascending: true })

  return (
    <InventoryItemsClient
      initialItems={items ?? []}
      tenantId={ctx.tenant_id ?? ''}
      canEdit={['owner', 'admin', 'manager'].includes(ctx.role)}
    />
  )
}
