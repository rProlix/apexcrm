export const dynamic = 'force-dynamic'

// app/(dashboard)/inventory/scanner/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getInventoryClient } from '@/lib/inventory/supabaseInventory'
import { InventoryScannerClient } from '@/components/inventory/InventoryScannerClient'

export const metadata = { title: 'Barcode Scanner — Inventory' }

export default async function InventoryScannerPage() {
  const ctx = await requireRole(['owner', 'admin', 'manager', 'staff'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'inventory', ctx.role)
  }

  const supabase = getInventoryClient()
  const { data: settings } = await supabase
    .from('inventory_settings')
    .select('barcode_mode')
    .eq('tenant_id', ctx.tenant_id ?? '')
    .maybeSingle() as { data: { barcode_mode?: string } | null }

  return (
    <InventoryScannerClient
      tenantId={ctx.tenant_id ?? ''}
      defaultBarcodeMode={settings?.barcode_mode ?? 'both'}
    />
  )
}
