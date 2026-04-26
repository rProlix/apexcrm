export const dynamic = 'force-dynamic'

// app/(dashboard)/website/import/page.tsx
import { redirect } from 'next/navigation'
import { requireOwner } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { WebsiteImportClient } from '@/components/website-import/WebsiteImportClient'

export const metadata = { title: 'Website Importer — Website Builder' }

export default async function WebsiteImportPage() {
  const ctx = await requireOwner()

  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const db = getSupabaseServerClient()

  // Load recent import jobs for this tenant
  const { data: jobs } = await db
    .from('website_import_jobs')
    .select(`
      id, status, progress, source_urls, notes,
      error_message, started_at, completed_at, created_at, updated_at,
      website_import_sources(id, source_url, source_type, fetched_status, confidence_score, page_title)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <WebsiteImportClient
      tenantId={tenantId}
      initialJobs={(jobs ?? []) as unknown as Parameters<typeof WebsiteImportClient>[0]['initialJobs']}
    />
  )
}
