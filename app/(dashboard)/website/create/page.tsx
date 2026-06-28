export const dynamic = 'force-dynamic'

// app/(dashboard)/website/create/page.tsx
// "What are you building?" — builder/app-type creation step.

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { WebsiteTypeSelector } from '@/components/website/WebsiteTypeSelector'
import type { WebsiteType } from '@/lib/pov/types'

export const metadata = { title: 'What are you building?' }

export default async function WebsiteCreatePage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const db = getSupabaseServerClient()
  const { data: settings } = await db
    .from('site_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // website_type may not exist on older type defs — read defensively.
  const currentType =
    ((settings as Record<string, unknown> | null)?.website_type as WebsiteType | undefined) ?? undefined

  return <WebsiteTypeSelector tenantId={tenantId} currentType={currentType} />
}
