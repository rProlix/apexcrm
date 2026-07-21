export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft, CalendarDays, Car, ExternalLink, Images, UserRound } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getVanDamagePageScope } from '@/lib/server/van-damage/page-scope'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { formatDriverName, type SlackDriverSnapshot } from '@/lib/van-damage/history'

export const metadata = { title: 'Driver Profile — NexoraNow' }

type QueryResult = Promise<{ data: unknown[] | null; error?: { message: string } | null }>
type LooseQuery = {
  select: (columns: string) => LooseQuery
  eq: (column: string, value: string) => LooseQuery
  order: (column: string, options: { ascending: boolean }) => LooseQuery
  limit: (count: number) => QueryResult
}
type NewTableClient = { from: (table: string) => LooseQuery }

type DriverProfile = {
  id: string
  slack_team_id: string
  slack_user_id: string
  display_name: string | null
  real_name: string | null
  username: string | null
  avatar_url: string | null
}

type DriverSession = {
  id: string
  van_id: string | null
  inspection_id: string
  slack_channel_id: string
  upload_started_at: string
  image_count: number
  status: string
  damage_result: string | null
  review_status: string
}

function driverSnapshot(profile: DriverProfile): SlackDriverSnapshot {
  return { slackWorkspaceId: profile.slack_team_id, slackUserId: profile.slack_user_id, displayName: profile.display_name, realName: profile.real_name, username: profile.username, avatarUrl: profile.avatar_url }
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(value))
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC'
}

export default async function DriverProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ driverId: string }>
  searchParams: Promise<{ businessId?: string }>
}) {
  const [{ driverId }, query] = await Promise.all([params, searchParams])
  const scope = await getVanDamagePageScope(query.businessId)
  if (!scope.businessId || !scope.tenantId) notFound()

  const db = getVanDamageServiceClient()
  const newTables = db as unknown as NewTableClient
  const [profileResult, sessionsResult, vehiclesResult, channelsResult] = await Promise.all([
    newTables.from('van_slack_user_profiles').select('*').eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId).eq('id', driverId).limit(1),
    newTables.from('van_damage_upload_sessions').select('id, van_id, inspection_id, slack_channel_id, upload_started_at, image_count, status, damage_result, review_status')
      .eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId).eq('driver_profile_id', driverId).order('upload_started_at', { ascending: false }).limit(500),
    db.from('vehicles').select('id, name, van_number, make, model, year').eq('tenant_id', scope.tenantId).limit(500),
    db.from('van_slack_channels').select('slack_channel_id, slack_channel_name').eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId),
  ])

  const profile = profileResult.data?.[0] as DriverProfile | undefined
  if (!profile) notFound()
  const sessions = (sessionsResult.data ?? []) as DriverSession[]
  const vehicles = new Map((vehiclesResult.data ?? []).map((van) => [van.id, van]))
  const channels = new Map((channelsResult.data ?? []).map((channel) => [channel.slack_channel_id, channel.slack_channel_name]))
  const name = formatDriverName(driverSnapshot(profile))
  const vanIds = [...new Set(sessions.map((session) => session.van_id).filter((id): id is string => Boolean(id)))]
  const sessionsByDay = new Map<string, DriverSession[]>()
  for (const session of sessions) {
    const key = session.upload_started_at.slice(0, 10)
    sessionsByDay.set(key, [...(sessionsByDay.get(key) ?? []), session])
  }

  return <div className="space-y-6 p-4 md:p-6">
    <Link href={`/dashboard/vehicles/drivers?businessId=${encodeURIComponent(scope.businessId)}`} className="focus-ring inline-flex items-center text-xs text-white/45 transition hover:text-white"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Driver profiles</Link>

    <section className="rounded-2xl border border-white/10 bg-graphite-800 p-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-400/10 text-gold-200"><UserRound className="h-6 w-6" /></span><div><p className="text-xs uppercase tracking-[.16em] text-white/30">Slack driver profile</p><h1 className="mt-1 text-2xl font-semibold text-white">{name}</h1>{profile.username && <p className="mt-1 text-xs text-white/40">@{profile.username}</p>}</div></div>
        <div className="grid grid-cols-3 gap-2 text-center"><Metric label="Vans" value={vanIds.length} /><Metric label="Uploads" value={sessions.length} /><Metric label="Images" value={sessions.reduce((sum, session) => sum + session.image_count, 0)} /></div>
      </div>
    </section>

    <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5">
      <div><h2 className="font-semibold text-white">Vans driven</h2><p className="mt-1 text-xs text-white/35">Derived from van image uploads submitted by this Slack user.</p></div>
      {vanIds.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{vanIds.map((vanId) => {
        const van = vehicles.get(vanId)
        const vanSessions = sessions.filter((session) => session.van_id === vanId)
        return <Link key={vanId} href={`/dashboard/vehicles/${vanId}?businessId=${encodeURIComponent(scope.businessId)}`} className="focus-ring rounded-xl border border-white/8 bg-white/[.02] p-4 transition hover:border-gold-400/25 hover:bg-white/[.04]"><div className="flex items-start justify-between"><Car className="h-4 w-4 text-gold-300/60" /><ExternalLink className="h-3.5 w-3.5 text-white/25" /></div><h3 className="mt-3 font-medium text-white">{van?.van_number ? `Van ${van.van_number}` : van?.name ?? 'Van'}</h3><p className="mt-1 text-xs text-white/35">{vanSessions.length} upload{vanSessions.length === 1 ? '' : 's'} · Last {formatDay(vanSessions[0].upload_started_at)}</p></Link>
      })}</div> : <p className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/35">No analyzed van has been linked to this driver yet.</p>}
    </section>

    <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5">
      <div><h2 className="font-semibold text-white">Upload history by day</h2><p className="mt-1 text-xs text-white/35">Each Slack message remains a separate submission.</p></div>
      <div className="mt-5 space-y-6">{[...sessionsByDay.entries()].map(([day, daySessions]) => <div key={day}><h3 className="flex items-center text-sm font-medium text-white/65"><CalendarDays className="mr-2 h-4 w-4 text-white/35" />{formatDay(`${day}T00:00:00Z`)}</h3><div className="mt-3 space-y-2">{daySessions.map((session) => {
        const van = session.van_id ? vehicles.get(session.van_id) : null
        return <Link key={session.id} href={`/dashboard/damage-ai/inspections/${session.inspection_id}?businessId=${encodeURIComponent(scope.businessId)}`} className="focus-ring flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[.02] p-4 transition hover:border-white/15 hover:bg-white/[.04]"><div><p className="text-sm font-medium text-white/70">{van?.van_number ? `Van ${van.van_number}` : van?.name ?? 'Van pending match'}</p><p className="mt-1 text-xs text-white/35">{formatTime(session.upload_started_at)} · #{channels.get(session.slack_channel_id) ?? session.slack_channel_id}</p></div><div className="flex flex-wrap gap-2 text-[10px]"><span className="rounded-full bg-white/5 px-2.5 py-1 text-white/45"><Images className="mr-1 inline h-3 w-3" />{session.image_count}</span><span className="rounded-full bg-white/5 px-2.5 py-1 capitalize text-white/45">{session.status.replaceAll('_', ' ')}</span><span className="rounded-full bg-white/5 px-2.5 py-1 capitalize text-white/45">{(session.damage_result ?? session.review_status).replaceAll('_', ' ')}</span></div></Link>
      })}</div></div>)}</div>
    </section>
  </div>
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="min-w-20 rounded-xl bg-white/[.03] px-4 py-3"><p className="text-lg font-semibold text-white">{value}</p><p className="text-[10px] uppercase tracking-[.12em] text-white/35">{label}</p></div>
}
