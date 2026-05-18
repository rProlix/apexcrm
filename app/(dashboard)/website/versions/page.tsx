// app/(dashboard)/website/versions/page.tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getWebsiteVersions } from '@/lib/website/versioning'
import { VersionHistoryClient } from '@/components/builder/VersionHistoryClient'

export default async function VersionHistoryPage() {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) redirect('/login')
  if (!ctx.tenant_id) redirect('/dashboard')

  const result = await getWebsiteVersions(ctx.tenant_id, 100)
  const versions = result.data ?? []

  return <VersionHistoryClient versions={versions} />
}
