// app/(dashboard)/website/settings/page.tsx
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { SettingsClient } from '@/components/website/SettingsClient'

export const metadata = { title: 'Settings — Website Builder' }

export default async function WebsiteSettingsPage() {
  const ctx = await requireRole(['owner', 'admin'])

  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const db = getSupabaseServerClient()
  const [tenantResult, settingsResult, domainResult] = await Promise.all([
    db.from('tenants').select('slug, name').eq('id', tenantId).single(),
    db.from('site_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
    db.from('tenant_domains').select('hostname, verified').eq('tenant_id', tenantId),
  ])

  const tenantSlug = tenantResult.data?.slug ?? ''

  return (
    <SettingsClient
      tenantId={tenantId}
      tenantSlug={tenantSlug}
      initialSettings={(settingsResult.data ?? null) as import('@/lib/website/types').SiteSettings | null}
      verifiedDomains={
        (domainResult.data ?? [])
          .filter((d) => d.verified)
          .map((d) => d.hostname)
      }
      allDomains={
        (domainResult.data ?? []).map((d) => ({
          hostname: d.hostname,
          verified: d.verified,
        }))
      }
    />
  )
}
