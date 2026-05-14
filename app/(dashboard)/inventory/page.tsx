export const dynamic = 'force-dynamic'

// app/(dashboard)/inventory/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getInventoryClient } from '@/lib/inventory/supabaseInventory'
import { InventoryDashboard } from '@/components/inventory/InventoryDashboard'

export const metadata = { title: 'Inventory — Dashboard' }

export default async function InventoryPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager', 'staff'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'inventory', ctx.role)
  }

  const supabase = getInventoryClient()
  const tenantId = ctx.tenant_id ?? ''

  const [
    { data: stats },
    { data: recentAlerts },
  ] = await Promise.all([
    supabase.rpc('get_inventory_dashboard_stats', { p_tenant_id: tenantId }),
    supabase
      .from('inventory_alerts')
      .select('id, alert_type, severity, title, status, created_at, inventory_item_id')
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'acknowledged'])
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  return (
    <InventoryDashboard
      tenantId={tenantId}
      stats={(stats as Record<string, unknown>) ?? null}
      recentAlerts={recentAlerts ?? []}
    />
  )
}
