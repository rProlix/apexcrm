export const dynamic = 'force-dynamic'

// app/(dashboard)/payments/links/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { PaymentLinkList } from '@/components/payments/PaymentLinkList'

export const metadata = { title: 'Payment Links — Payments' }

export default async function PaymentLinksPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'payments', ctx.role)

  const tenantId = ctx.tenant_id ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase  = getSupabaseServerClient() as any

  const [linksResult, invoicesResult] = await Promise.all([
    supabase
      .from('payment_links')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, invoice_number, title, amount, currency, status')
      .eq('tenant_id', tenantId)
      .in('status', ['draft', 'pending'])
      .order('created_at', { ascending: false }),
  ])

  return (
    <PaymentLinkList
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialLinks={(linksResult.data ?? []) as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoices={(invoicesResult.data ?? []) as any[]}
      tenantId={tenantId}
    />
  )
}
