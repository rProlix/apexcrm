// app/(dashboard)/website/pages/page.tsx
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { PagesClient } from '@/components/website/PagesClient'

export const metadata = { title: 'Pages — Website Builder' }

export default async function WebsitePagesPage() {
  const ctx = await requireRole(['owner', 'admin'])

  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const db = getSupabaseServerClient()
  const { data: pages } = await db
    .from('site_pages')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })

  return <PagesClient tenantId={tenantId} initialPages={(pages ?? []) as import('@/lib/website/types').SitePage[]} />
}
