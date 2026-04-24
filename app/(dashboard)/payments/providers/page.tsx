// app/(dashboard)/payments/providers/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ProviderStatusCard } from '@/components/payments/ProviderStatusCard'

export const metadata = { title: 'Providers — Payments' }

export default async function ProvidersPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'payments', ctx.role)

  const tenantId = ctx.tenant_id ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase  = getSupabaseServerClient() as any

  const { data: providers } = await supabase
    .from('payment_providers')
    .select('id, provider_key, is_enabled, is_default, created_at, updated_at')
    .eq('tenant_id', tenantId)

  const { data: accounts } = await supabase
    .from('payment_accounts')
    .select('id, provider_key, provider_account_id, status, connection_method, created_at')
    .eq('tenant_id', tenantId)

  return (
    <ProviderStatusCard
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      providers={(providers ?? []) as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accounts={(accounts ?? []) as any[]}
      tenantId={tenantId}
    />
  )
}
