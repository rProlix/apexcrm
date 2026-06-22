// app/(dashboard)/website/3d-diagnostics/page.tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { buildScrollHeroDiagnostics } from '@/lib/website/premium3d/diagnostics'
import { ScrollHeroDiagnosticsClient } from '@/components/website/premium/ScrollHeroDiagnosticsClient'

export default async function ScrollHero3DDiagnosticsPage() {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) redirect('/login')
  if (!ctx.tenant_id) redirect('/dashboard')

  const diagnostics = await buildScrollHeroDiagnostics(ctx.tenant_id)

  return <ScrollHeroDiagnosticsClient diagnostics={diagnostics} />
}
