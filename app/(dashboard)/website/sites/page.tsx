export const dynamic = 'force-dynamic'

// app/(dashboard)/website/sites/page.tsx
// "My Websites & Apps" — lists every separate website/app a business owns
// (business, creative, invitation/event, POV app), each with its own URL.

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { listWebsites } from '@/lib/website/registry'
import { WebsitesListClient } from '@/components/website/WebsitesListClient'

export const metadata = { title: 'My Websites & Apps' }

export default async function WebsitesListPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const websites = await listWebsites(tenantId)
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

  return <WebsitesListClient tenantId={tenantId} initialWebsites={websites} rootDomain={rootDomain} />
}
