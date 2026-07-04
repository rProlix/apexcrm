export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock3, FileSearch, MessageSquare, Settings } from 'lucide-react'
import { getVanDamagePageScope } from '@/lib/server/van-damage/page-scope'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { getVanDamageConfigPresence } from '@/lib/server/env'
import { loadActiveSlackIntegration, publicIntegration } from '@/lib/server/slack/integration'
import { StatusBadge } from '@/components/van-damage/StatusBadge'

export const metadata = { title: 'Van Damage AI — ApexCRM' }

export default async function DamageAIPage({ searchParams }: { searchParams: Promise<{ businessId?: string }> }) {
  const query = await searchParams
  const scope = await getVanDamagePageScope(query.businessId)
  if (!scope.businessId || !scope.tenantId) return <MissingBusiness />

  const db = getVanDamageServiceClient()
  const [inspectionResult, integration, channelResult] = await Promise.all([
    db.from('van_damage_inspections')
      .select('id, title, status, image_count, damage_count, ai_summary, ai_confidence, slack_team_id, slack_channel_id, slack_message_ts, created_at')
      .eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId)
      .order('created_at', { ascending: false }).limit(25),
    loadActiveSlackIntegration(scope.tenantId, scope.businessId),
    db.from('van_slack_channels').select('id', { count: 'exact', head: true })
      .eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId).eq('is_enabled', true),
  ])
  const inspections = inspectionResult.data ?? []
  const connected = publicIntegration(integration)
  const completed = inspections.filter((item) => item.status === 'completed').length
  const review = inspections.filter((item) => item.status === 'needs_review').length
  const pending = inspections.filter((item) => ['queued', 'processing', 'analyzing'].includes(item.status)).length
  const suffix = `?businessId=${encodeURIComponent(scope.businessId)}`
  const env = getVanDamageConfigPresence()

  return <div className="space-y-7">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-bold text-white">Van Damage AI</h1><p className="mt-1 text-sm text-white/40">Slack-powered van image intake and AI damage analysis</p></div>
      {['owner', 'admin'].includes(scope.ctx.role) && <Link href={`/dashboard/damage-ai/settings/slack${suffix}`} className="inline-flex items-center rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"><Settings className="mr-2 h-4 w-4" />Slack settings</Link>}
    </header>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { label: 'Inspections', value: inspections.length, icon: FileSearch, color: 'text-sky-300' },
        { label: 'In progress', value: pending, icon: Clock3, color: 'text-violet-300' },
        { label: 'Completed', value: completed, icon: CheckCircle2, color: 'text-emerald-300' },
        { label: 'Needs review', value: review, icon: AlertTriangle, color: 'text-amber-300' },
      ].map(({ label, value, icon: Icon, color }) => <div key={label} className="rounded-xl border border-white/10 bg-graphite-800 p-4"><Icon className={`h-5 w-5 ${color}`} /><p className="mt-4 text-2xl font-semibold text-white">{value}</p><p className="text-xs text-white/40">{label}</p></div>)}
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-white/10 bg-graphite-800 p-5">
        <div className="flex items-center justify-between"><div className="flex items-center gap-3"><MessageSquare className="h-5 w-5 text-fuchsia-300" /><div><h2 className="text-sm font-semibold text-white">Slack intake</h2><p className="text-xs text-white/40">{connected.connected ? connected.workspaceName || connected.teamId : 'Disconnected'}</p></div></div><span className={`text-xs ${connected.connected ? 'text-emerald-300' : 'text-white/35'}`}>{connected.connected ? 'Connected' : 'Not configured'}</span></div>
        <p className="mt-4 text-xs text-white/45">Selected channels: {channelResult.count ?? 0}. Image messages outside these channels are ignored.</p>
      </section>
      <section className="rounded-xl border border-white/10 bg-graphite-800 p-5">
        <h2 className="text-sm font-semibold text-white">Infrastructure configuration</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {[['SQS', env.sqsQueue], ['S3', env.s3Bucket], ['Gemini', env.gemini], ['Supabase', env.supabase]].map(([label, ok]) => <div key={String(label)} className="rounded-lg bg-white/[0.03] px-3 py-2 text-white/55">{label}: <span className={ok ? 'text-emerald-300' : 'text-amber-300'}>{ok ? 'configured' : 'missing'}</span></div>)}
        </div>
      </section>
    </div>

    <section className="overflow-hidden rounded-xl border border-white/10 bg-graphite-800">
      <div className="border-b border-white/8 px-5 py-4"><h2 className="font-semibold text-white">Recent inspections</h2></div>
      {inspections.length === 0 ? <div className="p-10 text-center text-sm text-white/35">No inspections yet. Connect Slack, select a channel, and post van images there.</div> : <div className="divide-y divide-white/8">
        {inspections.map((inspection) => <div key={inspection.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium text-white">{inspection.title || 'Van damage inspection'}</p><StatusBadge status={inspection.status} /></div><p className="mt-1 text-xs text-white/35">{new Date(inspection.created_at).toLocaleString()} · {inspection.image_count} images · {inspection.damage_count} damage items</p>{inspection.ai_summary && <p className="mt-2 line-clamp-2 text-sm text-white/55">{inspection.ai_summary}</p>}</div>
          <div className="flex shrink-0 gap-2"><Link href={`/dashboard/damage-ai/inspections/${inspection.id}${suffix}`} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/5">View inspection</Link>{inspection.status === 'needs_review' && <Link href={`/dashboard/damage-ai/inspections/${inspection.id}${suffix}&review=1`} className="rounded-lg bg-amber-400/15 px-3 py-2 text-xs text-amber-200">Review damage</Link>}</div>
        </div>)}
      </div>}
    </section>
  </div>
}

function MissingBusiness() {
  return <div className="rounded-xl border border-white/10 bg-graphite-800 p-8 text-center"><h1 className="text-xl font-semibold text-white">Select a business</h1><p className="mt-2 text-sm text-white/40">Platform owners must open Van Damage AI with a businessId query parameter.</p><Link href="/owner/tenants" className="mt-5 inline-block text-sm text-gold-300">Browse businesses</Link></div>
}
