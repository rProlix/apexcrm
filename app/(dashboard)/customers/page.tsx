// app/(dashboard)/customers/page.tsx
import { requirePermission } from '@/lib/auth/requirePermission'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getTenantCustomers, countTenantCustomers } from '@/lib/customers/getTenantCustomers'
import { CustomersDashboard } from '@/components/customers/CustomersDashboard'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const ctx = await requirePermission('view_customers')
  const tenantId = ctx.tenant_id!

  await guardModuleAccess(tenantId, 'customers', ctx.role)

  const [customers, totalCount, activeCount] = await Promise.all([
    getTenantCustomers(tenantId, { limit: 50 }),
    countTenantCustomers(tenantId),
    countTenantCustomers(tenantId, 'active'),
  ])

  return (
    <CustomersDashboard
      initialCustomers={customers}
      totalCount={totalCount}
      activeCount={activeCount}
      tenantId={tenantId}
      userRole={ctx.role}
    />
  )
}
