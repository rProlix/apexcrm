export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getVanDamagePageScope } from '@/lib/server/van-damage/page-scope'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { StatusBadge } from '@/components/van-damage/StatusBadge'
import { SignedDamageImage } from '@/components/van-damage/SignedDamageImage'

export default async function InspectionPage({
  params, searchParams,
}: {
  params: Promise<{ inspectionId: string }>
  searchParams: Promise<{ businessId?: string }>
}) {
  const [{ inspectionId }, query] = await Promise.all([params, searchParams])
  const scope = await getVanDamagePageScope(query.businessId)
  if (!scope.businessId || !scope.tenantId) notFound()
  const db = getVanDamageServiceClient()
  const inspectionResult = await db.from('van_damage_inspections').select('*')
    .eq('id', inspectionId).eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId).maybeSingle()
  if (!inspectionResult.data) notFound()
  const inspection = inspectionResult.data
  const [imagesResult, itemsResult, runsResult, jobResult] = await Promise.all([
    db.from('van_damage_images').select('*').eq('inspection_id', inspectionId).eq('tenant_id', scope.tenantId).order('created_at'),
    db.from('van_damage_items').select('*').eq('inspection_id', inspectionId).eq('tenant_id', scope.tenantId).order('severity'),
    ['owner', 'admin'].includes(scope.ctx.role)
      ? db.from('van_damage_ai_runs').select('*').eq('inspection_id', inspectionId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }).limit(1)
      : Promise.resolve({ data: [] }),
    db.from('van_damage_jobs').select('status, started_at, completed_at, attempt_count').eq('inspection_id', inspectionId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const images = imagesResult.data ?? []
  const items = itemsResult.data ?? []
  const aiRun = runsResult.data?.[0]
  const slackUrl = inspection.slack_team_id && inspection.slack_channel_id && inspection.slack_message_ts
    ? `https://app.slack.com/client/${inspection.slack_team_id}/${inspection.slack_channel_id}/${inspection.slack_message_ts.replace('.', '')}` : null

  return <div className="space-y-7">
    <header><Link href={`/dashboard/damage-ai?businessId=${encodeURIComponent(scope.businessId)}`} className="inline-flex items-center text-sm text-white/45 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />Inspections</Link><div className="mt-4 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold text-white">{inspection.title || 'Van damage inspection'}</h1><StatusBadge status={inspection.status} /></div><p className="mt-1 text-sm text-white/35">Created {new Date(inspection.created_at).toLocaleString()} · {inspection.image_count} images · {inspection.damage_count} findings</p>{slackUrl && <a href={slackUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center text-sm text-fuchsia-300 hover:text-fuchsia-200">Open Slack message <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>}</header>

    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-white/10 bg-graphite-800 p-5 md:col-span-2"><h2 className="text-sm font-semibold text-white">AI summary</h2><p className="mt-3 text-sm leading-6 text-white/60">{inspection.ai_summary || 'Analysis has not completed yet.'}</p></div>
      <div className="rounded-xl border border-white/10 bg-graphite-800 p-5"><h2 className="text-sm font-semibold text-white">Confidence</h2><p className="mt-3 text-3xl font-semibold text-white">{inspection.ai_confidence == null ? '—' : `${Math.round(inspection.ai_confidence * 100)}%`}</p><p className="mt-1 text-xs text-white/35">Model: {inspection.ai_model || '—'}</p></div>
    </section>

    <section><h2 className="mb-3 font-semibold text-white">Images</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{images.length ? images.map((image) => <SignedDamageImage key={image.id} imageId={image.id} businessId={scope.businessId!} alt={`Inspection image ${image.slack_file_id ?? image.id}`} />) : <p className="text-sm text-white/35">No images recorded.</p>}</div></section>

    <section className="rounded-xl border border-white/10 bg-graphite-800"><div className="border-b border-white/8 px-5 py-4"><h2 className="font-semibold text-white">Damage findings</h2></div>{items.length ? <div className="divide-y divide-white/8">{items.map((item) => <div key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium capitalize text-white">{(item.damage_type || 'unknown').replaceAll('_', ' ')}</p><StatusBadge status={item.severity || 'unknown'} /></div><p className="mt-2 text-sm text-white/55">{item.description || 'No description supplied.'}</p>{item.repair_recommendation && <p className="mt-2 text-xs text-white/40">Recommendation: {item.repair_recommendation}</p>}</div><div className="text-right text-xs text-white/40"><p>{item.vehicle_area?.replaceAll('_', ' ') || 'unknown area'}</p><p className="mt-1">{item.confidence == null ? '—' : `${Math.round(item.confidence * 100)}% confidence`}</p></div></div>)}</div> : <p className="p-6 text-sm text-white/35">No structured damage findings.</p>}</section>

    <section className="rounded-xl border border-white/10 bg-graphite-800 p-5"><h2 className="font-semibold text-white">Status timeline</h2><div className="mt-4 grid gap-3 text-sm text-white/50 sm:grid-cols-3"><div>Queued<br /><span className="text-xs text-white/30">{new Date(inspection.created_at).toLocaleString()}</span></div><div>Processing<br /><span className="text-xs text-white/30">{jobResult.data?.started_at ? new Date(jobResult.data.started_at).toLocaleString() : 'Waiting'}</span></div><div>Finished<br /><span className="text-xs text-white/30">{jobResult.data?.completed_at ? new Date(jobResult.data.completed_at).toLocaleString() : 'Waiting'}</span></div></div></section>

    {aiRun && <details className="rounded-xl border border-white/10 bg-graphite-800 p-5"><summary className="cursor-pointer text-sm font-semibold text-white">Raw AI diagnostics (admin)</summary><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-black/25 p-4 text-xs text-white/50">{JSON.stringify(aiRun, null, 2)}</pre></details>}
  </div>
}
