export const dynamic = 'force-dynamic'

// app/(dashboard)/website/ai-autofill/page.tsx
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { AiAutofillClient } from '@/components/website-ai/AiAutofillClient'
import type { AiImportJob } from '@/lib/website-ai/types'

export const metadata = { title: 'AI Autofill — Website Builder' }

export default async function WebsiteAiAutofillPage() {
  const ctx = await requireRole(['owner', 'admin'])

  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const db = getSupabaseServerClient()

  // Self-heal: ensure website module exists for this tenant
  const { data: websiteModule } = await db
    .from('tenant_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('module_key', 'website')
    .maybeSingle()

  if (websiteModule && !websiteModule.enabled && ctx.role !== 'owner') {
    redirect('/website?error=module_disabled')
  }

  // Load recent import jobs server-side for instant first render
  const { data: jobs } = await db
    .from('website_ai_import_jobs')
    .select(
      'id, source_type, status, summary, detected_business_type, detected_content_types, confidence, error_message, created_at, updated_at'
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(30)

  return (
    <AiAutofillClient
      tenantId={tenantId}
      isOwner={ctx.role === 'owner'}
      initialJobs={(jobs ?? []) as Partial<AiImportJob>[]}
    />
  )
}
