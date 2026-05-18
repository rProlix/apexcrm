export const dynamic = 'force-dynamic'

// app/(dashboard)/website/templates/page.tsx
// Premium Template Gallery — browse, preview, and apply templates to your website.

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { TemplatesClient } from '@/components/website/TemplatesClient'

export const metadata = { title: 'Website Templates' }

export default async function TemplatesPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  return <TemplatesClient tenantId={tenantId} />
}
