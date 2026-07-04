export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getVanDamagePageScope } from '@/lib/server/van-damage/page-scope'
import { loadActiveSlackIntegration, publicIntegration } from '@/lib/server/slack/integration'
import { SlackSettingsClient } from '@/components/van-damage/SlackSettingsClient'

export const metadata = { title: 'Slack Integration — Van Damage AI' }

export default async function SlackSettingsPage({ searchParams }: { searchParams: Promise<{ businessId?: string }> }) {
  const query = await searchParams
  const scope = await getVanDamagePageScope(query.businessId, true)
  if (!scope.businessId || !scope.tenantId) return <p className="text-white/60">A businessId is required.</p>
  const integration = await loadActiveSlackIntegration(scope.tenantId, scope.businessId)
  return <div className="mx-auto max-w-5xl space-y-6">
    <header><Link href={`/dashboard/damage-ai?businessId=${encodeURIComponent(scope.businessId)}`} className="inline-flex items-center text-sm text-white/45 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />Van Damage AI</Link><h1 className="mt-4 text-2xl font-bold text-white">Slack Integration</h1><p className="mt-1 text-sm text-white/40">Manage the tenant-scoped Slack bot connection and inspection channels.</p></header>
    <SlackSettingsClient businessId={scope.businessId} initialIntegration={publicIntegration(integration)} />
  </div>
}
