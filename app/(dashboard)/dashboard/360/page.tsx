export const dynamic = 'force-dynamic'

// app/(dashboard)/dashboard/360/page.tsx
// 360 Product Viewer — canonical dashboard page.
// Owner sees all tenants; admin is locked to their own.

import { redirect }           from 'next/navigation'
import { requirePermission }  from '@/lib/auth/requirePermission'
import { Rotate3D }           from 'lucide-react'
import Product360Dashboard    from '@/components/360/Product360Dashboard'

export const metadata = { title: '360 Product Viewer — ApexCRM' }

export default async function Dashboard360Page() {
  const ctx = await requirePermission('use_modules')

  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    redirect('/dashboard?error=forbidden')
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-600 to-violet-700 shadow-lg shadow-fuchsia-900/40">
          <Rotate3D className="h-6 w-6 text-white" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white leading-tight">360° Product Viewer</h1>
          <p className="text-sm text-white/40 mt-1">
            Create interactive product spin viewers — AI-generated or manually uploaded frames.
          </p>
        </div>
      </div>

      {/* Main dashboard client component */}
      <Product360Dashboard isOwner={ctx.role === 'owner'} defaultTenantId={ctx.tenant_id ?? ''} />
    </div>
  )
}
