export const dynamic = 'force-dynamic'

// app/(dashboard)/website/canva/page.tsx
// Manage the Canva import for the Invitation/Event website after creation.

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { CanvaImportPanel } from '@/components/website/canva/CanvaImportPanel'
import { CanvaImportDiagnostics } from '@/components/website/canva/CanvaImportDiagnostics'
import { getCanvaRunDiagnostics } from '@/lib/website/canva/runs'

export const metadata = { title: 'Import Canva Event Website' }

export default async function WebsiteCanvaPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any
  const { data: settings } = await db.from('site_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
  const { data: imports } = await db
    .from('website_canva_imports')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  const s = settings as Record<string, unknown> | null
  const runDiag = await getCanvaRunDiagnostics(tenantId)

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Import Canva Event Website</h1>
        <p className="text-sm text-white/40 mt-1">
          Bring a Canva design into your Invitation/Event website while keeping native POV Event Camera features.
        </p>
      </div>

      <CanvaImportPanel
        tenantId={tenantId}
        websiteId={tenantId}
        povEventId={(s?.pov_event_id as string) ?? null}
      />

      <CanvaImportDiagnostics
        settings={{
          website_type: (s?.website_type as string) ?? null,
          pov_enabled: Boolean(s?.pov_enabled),
          pov_event_id: (s?.pov_event_id as string) ?? null,
          canva_import_enabled: Boolean(s?.canva_import_enabled),
          canva_import_id: (s?.canva_import_id as string) ?? null,
          canva_import_mode: (s?.canva_import_mode as string) ?? null,
          canva_source_url: (s?.canva_source_url as string) ?? null,
          canva_animation_preservation: (s?.canva_animation_preservation as string) ?? null,
          is_published: Boolean(s?.is_published),
          subdomain: (s?.subdomain as string) ?? null,
          custom_domain: (s?.custom_domain as string) ?? null,
        }}
        runs={{
          latestRunId: runDiag.latestRunId,
          latestRunStatus: runDiag.latestRunStatus,
          hasPreImportSnapshot: runDiag.hasPreImportSnapshot,
          hasBeforePublishedSnapshot: runDiag.hasBeforePublishedSnapshot,
          undoAvailable: runDiag.undoAvailable,
        }}
        imports={(imports ?? []).map((row: Record<string, unknown>) => ({
          id: String(row.id),
          source_type: String(row.source_type),
          import_mode: String(row.import_mode),
          status: String(row.status),
          animation_preservation: String(row.animation_preservation),
          source_domain: (row.source_domain as string) ?? null,
          validation_mode: (row.validation_mode as string) ?? null,
          is_custom_domain: Boolean(row.is_custom_domain),
          warnings: (row.warnings as string[]) ?? [],
          created_at: String(row.created_at),
        }))}
      />
    </div>
  )
}
