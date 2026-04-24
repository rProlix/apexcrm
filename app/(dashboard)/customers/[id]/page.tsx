// app/(dashboard)/customers/[id]/page.tsx
import { requirePermission } from '@/lib/auth/requirePermission'
import { getTenantCustomerById } from '@/lib/customers/getTenantCustomerById'
import { getCustomerOrders } from '@/lib/customers/getCustomerOrders'
import { getCustomerPayments } from '@/lib/customers/getCustomerPayments'
import { getCustomerProfile } from '@/lib/customers/getCustomerProfile'
import { CustomerDetail } from '@/components/customers/CustomerDetail'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ id: string }> }

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params
  const ctx = await requirePermission('view_customers')
  const tenantId = ctx.tenant_id!

  const [customer, orders, payments, profile] = await Promise.all([
    getTenantCustomerById(tenantId, id),
    getCustomerOrders(tenantId, id, 10),
    getCustomerPayments(tenantId, id, 10),
    getCustomerProfile(tenantId, id),
  ])

  if (!customer) notFound()

  return (
    <CustomerDetail
      customer={customer}
      recentOrders={orders}
      recentPayments={payments}
      profile={profile}
      tenantId={tenantId}
      userRole={ctx.role}
      userEmail={ctx.email}
    />
  )
}
