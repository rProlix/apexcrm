// app/(dashboard)/customers/[id]/page.tsx
import { requirePermission } from '@/lib/auth/requirePermission'
import { getTenantCustomerById } from '@/lib/customers/getTenantCustomerById'
import { getCustomerOrders } from '@/lib/customers/getCustomerOrders'
import { getCustomerPayments } from '@/lib/customers/getCustomerPayments'
import { getCustomerProfile } from '@/lib/customers/getCustomerProfile'
import { CustomerDetail } from '@/components/customers/CustomerDetail'
import { notFound } from 'next/navigation'
import { requireCommandCenterContext } from '@/lib/command-center/context'
import { loadUniversalNotesResult } from '@/lib/command-center/notes'
import { UniversalNotesPanel } from '@/components/command-center/UniversalNotesPanel'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params
  const ctx = await requirePermission('view_customers')
  const tenantId = ctx.tenant_id!

  const commandContext = await requireCommandCenterContext('view_customers')
  const [customer, orders, payments, profile, notes] = await Promise.all([
    getTenantCustomerById(tenantId, id),
    getCustomerOrders(tenantId, id, 10),
    getCustomerPayments(tenantId, id, 10),
    getCustomerProfile(tenantId, id),
    loadUniversalNotesResult(commandContext, 'customer', id),
  ])

  if (!customer) notFound()

  return (
    <div className="space-y-6">
      <CustomerDetail
        customer={customer}
        recentOrders={orders}
        recentPayments={payments}
        profile={profile}
        tenantId={tenantId}
        userRole={ctx.role}
        userEmail={ctx.email}
      />
      <UniversalNotesPanel
        entityType="customer"
        entityId={id}
        initialNotes={notes.notes}
        loadError={notes.error}
        canManageVisibility={['owner', 'admin', 'manager'].includes(ctx.role)}
      />
    </div>
  )
}
