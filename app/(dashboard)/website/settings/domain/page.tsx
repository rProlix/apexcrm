// app/(dashboard)/website/settings/domain/page.tsx
// Website-specific domain settings — mirrors /settings/domain but lives under the
// website section and shows website-focused context (public site URL, preview link).

import { redirect }          from 'next/navigation'
import { getUserContext }    from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { DomainManager }     from '@/components/domains/DomainManager'
import { SubdomainDisplay }  from '@/components/domains/SubdomainDisplay'
import { DomainPreviewCard } from '@/components/domains/DomainPreviewCard'
import { Globe, ArrowLeft }  from 'lucide-react'
import Link                  from 'next/link'

export const metadata = { title: 'Website Domain' }

export default async function WebsiteSettingsDomainPage() {
  const ctx = await getUserContext()
  if (!ctx) redirect('/login')
  if (ctx.role === 'customer') redirect('/portal')
  if (!ctx.tenant_id && ctx.role !== 'owner') redirect('/dashboard')

  const tenantId = ctx.tenant_id ?? ''

  let slug          = 'your-business'
  let customDomain: string | null = null
  let isVerified    = false

  if (tenantId) {
    const db = getSupabaseServerClient()
    const { data: tenant } = await db
      .from('tenants')
      .select('slug, custom_domain')
      .eq('id', tenantId)
      .maybeSingle()
    if (tenant) {
      slug         = tenant.slug
      customDomain = tenant.custom_domain ?? null
    }

    if (customDomain) {
      const { data: domainRow } = await db
        .from('tenant_domains')
        .select('is_verified')
        .eq('hostname', customDomain)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      isVerified = domainRow?.is_verified ?? false
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Back nav */}
      <Link
        href="/website/settings"
        className="mb-6 flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Website Settings
      </Link>

      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c9a84c]/10 ring-1 ring-[#c9a84c]/20">
          <Globe className="h-5 w-5 text-[#c9a84c]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Website Domain</h1>
          <p className="text-sm text-zinc-500">
            Control which URL your public website is accessible on
          </p>
        </div>
      </div>

      {/* Quick preview (server-rendered) */}
      <div className="mb-6 space-y-3">
        <SubdomainDisplay slug={slug} label="Your Free Website URL" />
        {customDomain && (
          <DomainPreviewCard
            slug={slug}
            customDomain={customDomain}
            isVerified={isVerified}
          />
        )}
      </div>

      {/* Interactive domain manager */}
      {tenantId && (
        <DomainManager
          tenantId={tenantId}
          slug={slug}
          userRole={ctx.role === 'owner' ? 'owner' : 'admin'}
          showVercel={ctx.role === 'owner'}
        />
      )}
    </div>
  )
}
