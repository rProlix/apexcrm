// app/(dashboard)/customers/[id]/payments/page.tsx
import { requirePermission } from '@/lib/auth/requirePermission'
import { getTenantCustomerById } from '@/lib/customers/getTenantCustomerById'
import { getCustomerPayments } from '@/lib/customers/getCustomerPayments'
import { CustomerPaymentsList } from '@/components/customers/CustomerPaymentsList'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ id: string }> }

export default async function CustomerPaymentsPage({ params }: Props) {
  const { id } = await params
  const ctx = await requirePermission('view_customers')
  const tenantId = ctx.tenant_id!

  const [customer, payments] = await Promise.all([
    getTenantCustomerById(tenantId, id),
    getCustomerPayments(tenantId, id, 100),
  ])

  if (!customer) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/customers/${id}`}
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {customer.name}
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Payment History</h1>
        <p className="text-sm text-white/40 mt-1">
          {customer.name} · {payments.transactions.length} transactions · {payments.invoices.length} invoices
        </p>
      </div>
      <CustomerPaymentsList
        transactions={payments.transactions}
        invoices={payments.invoices}
        tenantId={tenantId}
      />
    </div>
  )
}
