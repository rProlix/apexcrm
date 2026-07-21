export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft, ArrowRight, CalendarDays, Car, Images, UserRound } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getVanDamagePageScope } from '@/lib/server/van-damage/page-scope'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { formatDriverName, type SlackDriverSnapshot } from '@/lib/van-damage/history'

export const metadata = { title: 'Driver Profiles — NexoraNow' }

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
  created_at: string
}

type DriverSession = {
  id: string
  driver_profile_id: string | null
  van_id: string | null
  upload_started_at: string
  image_count: number
  status: string
}

function snapshot(profile: DriverProfile): SlackDriverSnapshot {
  return {
    slackWorkspaceId: profile.slack_team_id,
    slackUserId: profile.slack_user_id,
    displayName: profile.display_name,
    realName: profile.real_name,
    username: profile.username,
    avatarUrl: profile.avatar_url,
  }
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'D'
}

function formatDate(value: string | null) {
  if (!value) return 'No uploads yet'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC'
}

export default async function DriverProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>
}) {
  const query = await searchParams
  const scope = await getVanDamagePageScope(query.businessId)
  if (!scope.businessId || !scope.tenantId) notFound()

  const db = getVanDamageServiceClient()
  const newTables = db as unknown as NewTableClient
  const [profilesResult, sessionsResult, vehiclesResult] = await Promise.all([
    newTables.from('van_slack_user_profiles').select('*')
      .eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId)
      .order('updated_at', { ascending: false }).limit(250),
    newTables.from('van_damage_upload_sessions')
      .select('id, driver_profile_id, van_id, upload_started_at, image_count, status')
      .eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId)
      .order('upload_started_at', { ascending: false }).limit(1000),
    db.from('vehicles').select('id, name, van_number')
      .eq('tenant_id', scope.tenantId).limit(500),
  ])

  const profiles = (profilesResult.data ?? []) as DriverProfile[]
  const sessions = (sessionsResult.data ?? []) as DriverSession[]
  const vehicles = new Map((vehiclesResult.data ?? []).map((van) => [van.id, van]))

  return <div className="space-y-6 p-4 md:p-6">
    <div>
      <Link href={`/dashboard/vehicles?businessId=${encodeURIComponent(scope.businessId)}`} className="focus-ring inline-flex items-center text-xs text-white/45 transition hover:text-white"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Vehicles</Link>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold text-white">Driver profiles</h1><p className="mt-1 text-sm text-white/40">Slack uploaders linked to the vans and dates they submitted.</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-right"><p className="text-2xl font-semibold text-white">{profiles.length}</p><p className="text-[10px] uppercase tracking-[.16em] text-white/35">Drivers</p></div>
      </div>
    </div>

    {profiles.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {profiles.map((profile) => {
        const driverSessions = sessions.filter((session) => session.driver_profile_id === profile.id)
        const vanIds = [...new Set(driverSessions.map((session) => session.van_id).filter((id): id is string => Boolean(id)))]
        const name = formatDriverName(snapshot(profile))
        const imageCount = driverSessions.reduce((total, session) => total + session.image_count, 0)
        return <Link key={profile.id} href={`/dashboard/vehicles/drivers/${profile.id}?businessId=${encodeURIComponent(scope.businessId)}`} className="focus-ring group rounded-2xl border border-white/10 bg-graphite-800 p-5 transition hover:border-gold-400/30 hover:bg-graphite-700">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-400/10 text-sm font-semibold text-gold-200">{initials(name)}</span><div className="min-w-0"><h2 className="truncate font-semibold text-white">{name}</h2><p className="mt-0.5 text-xs text-white/35">Slack driver profile</p></div></div>
            <ArrowRight className="mt-3 h-4 w-4 shrink-0 text-white/25 transition group-hover:translate-x-1 group-hover:text-gold-300" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/[.03] p-3"><p className="font-semibold text-white">{vanIds.length}</p><p className="mt-1 text-[10px] text-white/35">Vans</p></div>
            <div className="rounded-xl bg-white/[.03] p-3"><p className="font-semibold text-white">{driverSessions.length}</p><p className="mt-1 text-[10px] text-white/35">Uploads</p></div>
            <div className="rounded-xl bg-white/[.03] p-3"><p className="font-semibold text-white">{imageCount}</p><p className="mt-1 text-[10px] text-white/35">Images</p></div>
          </div>
          <p className="mt-4 flex items-center text-xs text-white/40"><CalendarDays className="mr-2 h-3.5 w-3.5" />Last upload: {formatDate(driverSessions[0]?.upload_started_at ?? null)}</p>
          {vanIds.length > 0 && <p className="mt-2 flex items-center truncate text-xs text-white/40"><Car className="mr-2 h-3.5 w-3.5 shrink-0" />{vanIds.slice(0, 3).map((id) => vehicles.get(id)?.van_number ? `Van ${vehicles.get(id)?.van_number}` : vehicles.get(id)?.name ?? 'Van').join(', ')}</p>}
        </Link>
      })}
    </div> : <div className="rounded-2xl border border-dashed border-white/10 bg-white/[.02] p-12 text-center"><UserRound className="mx-auto h-10 w-10 text-white/20" /><h2 className="mt-4 font-medium text-white/65">No driver profiles yet</h2><p className="mt-2 text-sm text-white/35">A profile is created automatically when a Slack user uploads van images.</p></div>}

    <div className="flex flex-wrap gap-4 text-xs text-white/35"><span className="inline-flex items-center"><Car className="mr-1.5 h-3.5 w-3.5" />Van links come from analyzed Slack inspections</span><span className="inline-flex items-center"><Images className="mr-1.5 h-3.5 w-3.5" />One Slack message remains one upload session</span></div>
  </div>
}
