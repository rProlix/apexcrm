// app/(dashboard)/payments/invoices/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { InvoiceList } from '@/components/payments/InvoiceList'

export const metadata = { title: 'Invoices — Payments' }

export default async function InvoicesPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'payments', ctx.role)

  const tenantId = ctx.tenant_id ?? ''
  const supabase  = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const [invoicesResult, customersResult] = await Promise.all([
    sb
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    sb
      .from('customers')
      .select('id, first_name, last_name, email')
      .eq('tenant_id', tenantId)
      .order('first_name'),
  ])

  return (
    <InvoiceList
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialInvoices={(invoicesResult.data ?? []) as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customers={(customersResult.data ?? []) as any[]}
      tenantId={tenantId}
    />
  )
}
