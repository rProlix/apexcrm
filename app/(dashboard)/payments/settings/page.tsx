// app/(dashboard)/payments/settings/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getPaymentSettings } from '@/lib/payments/getPaymentSettings'
import { ProviderSettingsForm } from '@/components/payments/ProviderSettingsForm'

export const metadata = { title: 'Settings — Payments' }

export default async function PaymentSettingsPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'payments', ctx.role)

  const tenantId = ctx.tenant_id ?? ''
  const settings = await getPaymentSettings(tenantId)

  // Don't pass webhook_secret to client
  const { webhook_secret: _, ...safeSettings } = settings

  return (
    <ProviderSettingsForm
      settings={safeSettings}
      tenantId={tenantId}
    />
  )
}
