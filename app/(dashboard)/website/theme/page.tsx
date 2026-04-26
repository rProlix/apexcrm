export const dynamic = 'force-dynamic'

// app/(dashboard)/website/theme/page.tsx
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { ThemeClient } from '@/components/website/ThemeClient'

export const metadata = { title: 'Theme — Website Builder' }

export default async function WebsiteThemePage() {
  const ctx = await requireRole(['owner', 'admin'])

  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const db = getSupabaseServerClient()
  const { data: settings } = await db
    .from('site_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return <ThemeClient tenantId={tenantId} initialSettings={(settings ?? null) as import('@/lib/website/types').SiteSettings | null} />
}
