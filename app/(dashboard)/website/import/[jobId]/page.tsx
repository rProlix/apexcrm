export const dynamic = 'force-dynamic'

// app/(dashboard)/website/import/[jobId]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { requireOwner } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { ImportJobDetailClient } from '@/components/website-import/ImportJobDetailClient'

export const metadata = { title: 'Import Job — Website Builder' }

interface Props {
  params: Promise<{ jobId: string }>
}

export default async function ImportJobDetailPage({ params }: Props) {
  const { jobId } = await params
  const ctx = await requireOwner()

  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const db = getSupabaseServerClient()

  const { data: job } = await db
    .from('website_import_jobs')
    .select(`
      *,
      website_import_sources(*),
      website_import_results(*),
      website_import_media(*),
      website_import_audit(id, action, metadata, created_at)
    `)
    .eq('id', jobId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!job) notFound()

  return (
    <ImportJobDetailClient
      tenantId={tenantId}
      job={job as Parameters<typeof ImportJobDetailClient>[0]['job']}
    />
  )
}
