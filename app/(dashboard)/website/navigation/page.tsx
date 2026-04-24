// app/(dashboard)/website/navigation/page.tsx
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { NavigationClient } from '@/components/website/NavigationClient'

export const metadata = { title: 'Navigation — Website Builder' }

export default async function WebsiteNavigationPage() {
  const ctx = await requireRole(['owner', 'admin'])

  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const db = getSupabaseServerClient()
  const { data: items } = await db
    .from('site_navigation_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('location')
    .order('sort_order', { ascending: true })

  return <NavigationClient tenantId={tenantId} initialItems={(items ?? []) as import('@/lib/website/types').SiteNavigationItem[]} />
}
