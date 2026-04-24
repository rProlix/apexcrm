// app/(customer)/portal/customers/profile/page.tsx
import { headers } from 'next/headers'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getTenantCustomerById } from '@/lib/customers/getTenantCustomerById'
import { ensureCustomerProfile } from '@/lib/customers/getCustomerProfile'
import { CustomerProfileEditor } from '@/components/customers/CustomerProfileEditor'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function CustomerPortalProfilePage() {
  const host = (await headers()).get('host') ?? ''
  const ctx  = await requireCustomerAuth(host)

  const customer = await getTenantCustomerById(ctx.tenant_id, ctx.customer_id)
  if (!customer) redirect('/login')

  const profile = await ensureCustomerProfile(ctx.tenant_id, ctx.customer_id)

  return (
    <div className="space-y-6">
      <Link
        href="/portal/customers"
        className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to account
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">My Profile</h1>
        <p className="text-sm text-white/40 mt-1">Manage your preferences for this business</p>
      </div>

      {/* Read-only info */}
      <div className="premium-panel premium-border rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Account Info</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-white/30">Name</p>
            <p className="text-sm text-white/80 mt-0.5">{customer.name}</p>
          </div>
          <div>
            <p className="text-xs text-white/30">Email</p>
            <p className="text-sm text-white/80 mt-0.5">{customer.email ?? '—'}</p>
          </div>
          {customer.phone && (
            <div>
              <p className="text-xs text-white/30">Phone</p>
              <p className="text-sm text-white/80 mt-0.5">{customer.phone}</p>
            </div>
          )}
        </div>
        <p className="text-xs text-white/20 pt-2 border-t border-white/6">
          To update your name or contact details, please reach out to us directly.
        </p>
      </div>

      {/* Preferences (editable) */}
      <CustomerProfileEditor
        customer={customer}
        profile={profile}
        tenantId={ctx.tenant_id}
        userEmail={ctx.email}
        isAdmin={false}
      />
    </div>
  )
}
