export const dynamic = 'force-dynamic'

// app/(dashboard)/inventory/settings/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getInventoryClient } from '@/lib/inventory/supabaseInventory'
import { InventorySettingsClient } from '@/components/inventory/InventorySettingsClient'

export const metadata = { title: 'Inventory Settings' }

export default async function InventorySettingsPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'inventory', ctx.role)
  }

  const supabase = getInventoryClient()
  const { data: settings } = await supabase
    .from('inventory_settings')
    .select('*')
    .eq('tenant_id', ctx.tenant_id ?? '')
    .maybeSingle()

  return (
    <InventorySettingsClient
      tenantId={ctx.tenant_id ?? ''}
      initialSettings={settings ?? null}
    />
  )
}
