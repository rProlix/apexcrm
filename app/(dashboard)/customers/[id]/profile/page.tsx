// app/(dashboard)/customers/[id]/profile/page.tsx
import { requirePermission } from '@/lib/auth/requirePermission'
import { getTenantCustomerById } from '@/lib/customers/getTenantCustomerById'
import { ensureCustomerProfile } from '@/lib/customers/getCustomerProfile'
import { CustomerProfileEditor } from '@/components/customers/CustomerProfileEditor'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props { params: { id: string } }

export default async function CustomerProfilePage({ params }: Props) {
  const ctx = await requirePermission('manage_customers')
  const tenantId = ctx.tenant_id!

  const customer = await getTenantCustomerById(tenantId, params.id)
  if (!customer) notFound()

  const profile = await ensureCustomerProfile(tenantId, params.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/customers/${params.id}`}
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {customer.name}
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Profile & Notes</h1>
        <p className="text-sm text-white/40 mt-1">{customer.name}</p>
      </div>
      <CustomerProfileEditor
        customer={customer}
        profile={profile}
        tenantId={tenantId}
        userEmail={ctx.email}
        isAdmin
      />
    </div>
  )
}
