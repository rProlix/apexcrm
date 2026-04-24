// app/(dashboard)/owner/tenants/[tenantId]/domain/page.tsx
// Platform owner page to manage domains for any specific tenant.

import { redirect, notFound }     from 'next/navigation'
import { requireOwner }           from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { DomainManager }          from '@/components/domains/DomainManager'
import { SubdomainDisplay }       from '@/components/domains/SubdomainDisplay'
import { Globe, ArrowLeft, Building2, Shield } from 'lucide-react'
import Link                       from 'next/link'
import { isVercelConfigured }     from '@/lib/vercel/client'

interface Props {
  params: { tenantId: string }
}

export async function generateMetadata({ params }: Props) {
  return { title: `Domain — Tenant ${params.tenantId.slice(0, 8)}` }
}

export default async function OwnerTenantDomainPage({ params }: Props) {
  await requireOwner()

  const db = getSupabaseServerClient()

  const { data: tenant } = await db
    .from('tenants')
    .select('id, name, slug, custom_domain, status')
    .eq('id', params.tenantId)
    .maybeSingle()

  if (!tenant) notFound()

  const { data: domains } = await db
    .from('tenant_domains')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  const vercelConfigured = isVercelConfigured()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Back nav */}
      <Link
        href="/owner/tenants"
        className="mb-6 flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Tenants
      </Link>

      {/* Tenant info card */}
      <div className="mb-8 rounded-2xl border border-zinc-700/50 bg-zinc-900/60 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 ring-1 ring-zinc-700/50">
            <Building2 className="h-6 w-6 text-zinc-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">{tenant.name}</h2>
            <p className="text-sm text-zinc-500">
              <span className="font-mono">{tenant.slug}</span>
              <span className="mx-2 text-zinc-700">·</span>
              <span className={`text-xs font-medium ${
                tenant.status === 'active' ? 'text-emerald-400' : 'text-zinc-500'
              }`}>{tenant.status}</span>
            </p>
          </div>
          <div className="ml-auto">
            <span className="flex items-center gap-1.5 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/10 px-3 py-1 text-xs font-medium text-[#c9a84c]">
              <Shield className="h-3 w-3" />
              Owner View
            </span>
          </div>
        </div>
      </div>

      {/* Page header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c9a84c]/10 ring-1 ring-[#c9a84c]/20">
          <Globe className="h-5 w-5 text-[#c9a84c]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Domain Management</h1>
          <p className="text-sm text-zinc-500">
            {(domains ?? []).length} domain{(domains ?? []).length !== 1 ? 's' : ''} configured
            {!vercelConfigured && (
              <span className="ml-2 text-amber-500/70">· Vercel not configured</span>
            )}
          </p>
        </div>
      </div>

      <SubdomainDisplay slug={tenant.slug} />

      <div className="mt-6">
        <DomainManager
          tenantId={tenant.id}
          slug={tenant.slug}
          userRole="owner"
          showVercel={vercelConfigured}
        />
      </div>
    </div>
  )
}
