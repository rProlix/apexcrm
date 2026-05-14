export const dynamic = 'force-dynamic'

// app/(dashboard)/inventory/alerts/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getInventoryClient } from '@/lib/inventory/supabaseInventory'
import { InventoryAlertsClient } from '@/components/inventory/InventoryAlertsClient'
import type { InventoryAlert } from '@/lib/inventory/types'

export const metadata = { title: 'Inventory Alerts' }

export default async function InventoryAlertsPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager', 'staff'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'inventory', ctx.role)
  }

  const supabase = getInventoryClient()
  const { data: alerts } = await supabase
    .from('inventory_alerts')
    .select(`
      *,
      inventory_items(name, unit, current_quantity)
    `)
    .eq('tenant_id', ctx.tenant_id ?? '')
    .order('created_at', { ascending: false })
    .limit(100)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flatAlerts: InventoryAlert[] = (alerts ?? []).map((a: any) => {
    const inv = a.inventory_items as { name?: string; unit?: string; current_quantity?: number } | null
    const { inventory_items: _inv, ...rest } = a
    return {
      ...rest,
      item_name:        inv?.name ?? null,
      item_unit:        inv?.unit ?? null,
      current_quantity: inv?.current_quantity ?? null,
    } as InventoryAlert
  })

  return (
    <InventoryAlertsClient
      initialAlerts={flatAlerts}
      tenantId={ctx.tenant_id ?? ''}
      canEdit={['owner', 'admin', 'manager'].includes(ctx.role)}
    />
  )
}
