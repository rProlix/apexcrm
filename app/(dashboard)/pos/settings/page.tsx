export const dynamic = 'force-dynamic'

// app/(dashboard)/pos/settings/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { POSSettingsClient } from '@/components/pos/POSSettingsClient'

export const metadata = { title: 'POS Settings' }

export default async function POSSettingsPage() {
  const ctx = await requireRole(['owner', 'admin'])

  if (ctx.tenant_id) {
    await guardModuleAccess(ctx.tenant_id, 'pos', ctx.role)
  }

  const supabase = getPOSClient()
  const tenantId = ctx.tenant_id ?? ''

  const [{ data: settings }, { data: providers }] = await Promise.all([
    supabase.from('pos_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('payment_providers').select('provider_key,is_enabled,is_default').eq('tenant_id', tenantId),
  ])

  return (
    <POSSettingsClient
      tenantId={tenantId}
      initialSettings={settings ?? null}
      paymentProviders={providers ?? []}
    />
  )
}
