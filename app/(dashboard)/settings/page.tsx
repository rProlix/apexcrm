export const dynamic = 'force-dynamic'

// app/(dashboard)/settings/page.tsx
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { SettingsClient } from '@/components/settings/SettingsClient'

export const metadata = { title: 'Settings — ApexCRM' }

export default async function SettingsPage() {
  const ctx = await requireRole(['owner', 'admin'])

  const tenantId = ctx.tenant_id
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const db = getSupabaseServerClient()

  const [
    tenantResult,
    modulesResult,
    subscriptionResult,
    membersResult,
    siteSettingsResult,
    domainsResult,
  ] = await Promise.all([
    db
      .from('tenants')
      .select('id, name, slug, subdomain, custom_domain, branding, status, created_at')
      .eq('id', tenantId)
      .single(),
    db
      .from('tenant_modules')
      .select('module_key, enabled, config')
      .eq('tenant_id', tenantId)
      .order('module_key'),
    db
      .from('subscriptions')
      .select('status, current_period_end, stripe_customer_id, plans(name, slug, price_cents, currency)')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    db
      .from('users')
      .select('id, email, role, status, created_at, metadata')
      .eq('tenant_id', tenantId)
      .neq('role', 'owner')                         // owner must never appear in tenant team views
      .in('role', ['admin', 'staff'])                // only recognised staff roles
      .order('created_at', { ascending: true }),
    db
      .from('site_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    db
      .from('tenant_domains')
      .select('hostname, verified')
      .eq('tenant_id', tenantId),
  ])

  if (tenantResult.error || !tenantResult.data) {
    redirect('/dashboard?error=no_tenant')
  }

  const tenant   = tenantResult.data
  const branding = (tenant.branding ?? {}) as Record<string, unknown>

  return (
    <SettingsClient
      tenantId={tenantId}
      tenantName={tenant.name}
      tenantSlug={tenant.slug}
      tenantSubdomain={tenant.subdomain ?? null}
      tenantStatus={tenant.status}
      branding={branding}
      modules={(modulesResult.data ?? []) as Array<{ module_key: string; enabled: boolean; config: Record<string, unknown> }>}
      subscription={(subscriptionResult.data ?? null) as {
        status: string
        current_period_end: string | null
        stripe_customer_id: string | null
        plans: { name: string; slug: string; price_cents: number; currency: string } | null
      } | null}
      members={(membersResult.data ?? []) as Array<{
        id: string; email: string; role: string; status: string; created_at: string; metadata: Record<string, unknown>
      }>}
      siteSettings={(siteSettingsResult.data ?? null) as import('@/lib/website/types').SiteSettings | null}
      allDomains={(domainsResult.data ?? []).map((d) => ({
        hostname: d.hostname,
        verified: d.verified,
      }))}
      currentUserRole={ctx.role}
      currentUserId={ctx.id}
    />
  )
}
