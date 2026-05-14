export const dynamic = 'force-dynamic'

// app/(dashboard)/inventory/trends/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { InventoryTrendsClient } from '@/components/inventory/InventoryTrendsClient'

export const metadata = { title: 'Inventory Trends & Predictions' }

export default async function InventoryTrendsPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager', 'staff'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'inventory', ctx.role)
  }

  return <InventoryTrendsClient tenantId={ctx.tenant_id ?? ''} />
}
