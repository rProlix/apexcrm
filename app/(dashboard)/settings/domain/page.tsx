// app/(dashboard)/settings/domain/page.tsx
import { redirect }       from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { DomainManager }  from '@/components/domains/DomainManager'
import { Globe }          from 'lucide-react'

export const metadata = { title: 'Domain Settings' }

export default async function SettingsDomainPage() {
  const ctx = await getUserContext()
  if (!ctx) redirect('/login')

  if ((ctx.role as string) === 'customer') redirect('/portal')

  if (ctx.role !== 'owner' && !ctx.tenant_id) {
    redirect('/dashboard?error=no_tenant')
  }

  const tenantId = ctx.role === 'owner' ? (ctx.tenant_id ?? '') : ctx.tenant_id!

  // Fetch the tenant slug for subdomain display
  let slug = 'your-business'
  if (tenantId) {
    const { getSupabaseServerClient } = await import('@/lib/supabase/server')
    const db = getSupabaseServerClient()
    const { data } = await db.from('tenants').select('slug').eq('id', tenantId).maybeSingle()
    if (data?.slug) slug = data.slug
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c9a84c]/10 ring-1 ring-[#c9a84c]/20">
            <Globe className="h-5 w-5 text-[#c9a84c]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Domain Settings</h1>
            <p className="text-sm text-zinc-500">Manage your platform subdomain and custom domains</p>
          </div>
        </div>
      </div>

      {tenantId ? (
        <DomainManager
          tenantId={tenantId}
          slug={slug}
          userRole={ctx.role === 'owner' ? 'owner' : 'admin'}
          showVercel={ctx.role === 'owner'}
        />
      ) : (
        <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/60 p-8 text-center">
          <Globe className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
          <p className="text-zinc-400">No tenant associated with this account.</p>
        </div>
      )}
    </div>
  )
}
