// app/(dashboard)/staff/page.tsx
// Staff management page — accessible by admin (own tenant) and owner.
// Owner accounts are NEVER displayed or manageable from this page.
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getTenantStaff } from '@/lib/staff/getTenantStaff'
import { StaffList } from '@/components/staff/StaffList'
import { Users, ShieldAlert } from 'lucide-react'

export const metadata = { title: 'Staff Management — ApexCRM' }

export default async function StaffPage() {
  const ctx = await requireRole(['owner', 'admin'])

  // Owner must have a tenant context to manage staff
  if (!ctx.tenant_id) {
    redirect('/dashboard?error=no_tenant')
  }

  const staff = await getTenantStaff(ctx.tenant_id)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Staff Management</h1>
          <p className="text-sm text-white/40 mt-0.5">
            Manage team members in your workspace — owner accounts are never shown here
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-white/30 bg-graphite-700 border border-graphite-500 rounded-xl px-3 py-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-gold-400" />
          <span className="capitalize">{ctx.role}</span>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-surface-border bg-graphite-900/60 px-4 py-4">
          <div className="inline-flex p-2 rounded-lg bg-blue-500/8 mb-3">
            <Users className="h-4 w-4 text-blue-400" strokeWidth={1.75} />
          </div>
          <p className="text-2xl font-bold text-white leading-none mb-1">{staff.length}</p>
          <p className="text-xs text-white/35 font-medium">Total Staff</p>
        </div>

        <div className="rounded-2xl border border-surface-border bg-graphite-900/60 px-4 py-4">
          <div className="inline-flex p-2 rounded-lg bg-gold-500/8 mb-3">
            <ShieldAlert className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
          </div>
          <p className="text-2xl font-bold text-white leading-none mb-1">
            {staff.filter((s) => s.role === 'admin').length}
          </p>
          <p className="text-xs text-white/35 font-medium">Admins</p>
        </div>

        <div className="rounded-2xl border border-surface-border bg-graphite-900/60 px-4 py-4">
          <div className="inline-flex p-2 rounded-lg bg-emerald-500/8 mb-3">
            <Users className="h-4 w-4 text-emerald-400" strokeWidth={1.75} />
          </div>
          <p className="text-2xl font-bold text-white leading-none mb-1">
            {staff.filter((s) => s.role === 'staff').length}
          </p>
          <p className="text-xs text-white/35 font-medium">Staff Members</p>
        </div>
      </div>

      {/* Staff list */}
      <StaffList
        initialStaff={staff}
        currentUserId={ctx.id}
        currentUserRole={ctx.role}
      />
    </div>
  )
}
