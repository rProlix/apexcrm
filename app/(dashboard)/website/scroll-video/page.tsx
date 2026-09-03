export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { ScrollVideoWorkspace } from '@/components/website/scroll-experience/ScrollVideoWorkspace'
import { CinematicStudio } from '@/components/website/cinematic/CinematicStudio'

export const metadata = { title: 'Cinematic Scroll - Website Builder' }

export default async function ScrollVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ section_id?: string }>
}) {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const db = getSupabaseServerClient()
  const { section_id: requestedSectionId } = await searchParams
  const [pagesResult, sectionResult] = await Promise.all([
    db
      .from('site_pages')
      .select('id,title,slug,status')
      .eq('tenant_id', tenantId)
      .neq('status', 'archived')
      .order('sort_order', { ascending: true }),
    requestedSectionId
      ? db
          .from('site_sections')
          .select('id,page_id,section_type,content')
          .eq('id', requestedSectionId)
          .eq('tenant_id', tenantId)
          .eq('section_type', 'scroll_experience')
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (sectionResult.data) {
    return (
      <CinematicStudio
        sectionId={sectionResult.data.id}
        initialContent={(sectionResult.data.content ?? {}) as Record<string, unknown>}
      />
    )
  }

  return (
    <ScrollVideoWorkspace
      tenantId={tenantId}
      pages={pagesResult.data ?? []}
      targetSection={undefined}
    />
  )
}
