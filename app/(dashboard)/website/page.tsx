// app/(dashboard)/website/page.tsx
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { WebsiteOverviewClient } from '@/components/website/WebsiteOverviewClient'

export const metadata = { title: 'Website Builder' }

export default async function WebsitePage() {
  const ctx = await requireRole(['owner', 'admin'])

  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  // Ensure the website module exists for this tenant (self-healing for pre-007 tenants)
  const db = getSupabaseServerClient()
  const { data: existing } = await db
    .from('tenant_modules')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('module_key', 'website')
    .maybeSingle()

  if (!existing) {
    await db
      .from('tenant_modules')
      .insert({ tenant_id: tenantId, module_key: 'website', enabled: true, config: {} })
  }

  const [settingsResult, pagesResult, navResult] = await Promise.all([
    db.from('site_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
    db
      .from('site_pages')
      .select('id, slug, title, page_type, status, sort_order, created_at')
      .eq('tenant_id', tenantId)
      .neq('status', 'archived')
      .order('sort_order', { ascending: true }),
    db.from('site_navigation_items').select('id').eq('tenant_id', tenantId),
  ])

  return (
    <WebsiteOverviewClient
      tenantId={tenantId}
      initialSettings={settingsResult.data ?? null}
      initialPages={pagesResult.data ?? []}
      navCount={navResult.data?.length ?? 0}
    />
  )
}
