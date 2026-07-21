'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle, CalendarDays, Camera, Copy, ExternalLink,
  History, ImageIcon, RotateCcw, ShieldAlert, UserRound, Wrench,
} from 'lucide-react'
import { SignedDamageImage } from './SignedDamageImage'
import { StatusBadge } from './StatusBadge'
import { formatDriverName } from '@/lib/van-damage/history'

type JsonRecord = Record<string, unknown>

export type VanProfileImage = {
  mode: 'manual' | 'automatic_first_upload' | 'fallback'
  imageId: string | null
}

export type VanProfileVehicle = {
  id: string
  name: string
  van_number: string | null
  make: string | null
  model: string | null
  year: number | null
  plate_number: string | null
  vin: string | null
  status: string
  metadata: JsonRecord
}

export type VanProfileSession = {
  id: string
  inspection_id: string
  source_key: string
  slack_team_id: string
  slack_channel_id: string
  slack_user_id: string | null
  slack_message_ts: string
  slack_thread_ts: string | null
  slack_permalink: string | null
  original_text: string | null
  driver_snapshot: JsonRecord
  upload_started_at: string
  first_image_id: string | null
  image_count: number
  status: string
  damage_result: string | null
  review_status: string
  created_at: string
  channelName: string | null
  inspection: {
    status: string
    review_status: string
    damage_count: number
    ai_summary: string | null
    ai_confidence: number | null
    completed_at: string | null
    created_at: string
  } | null
  images: Array<{ id: string; upload_order: number | null; status: string; image_role: string | null }>
  observations: Array<{ observation_type: string; severity: string | null }>
}

export type VanProfileCase = {
  id: string
  canonical_region: string
  normalized_damage_type: string
  original_damage_type: string | null
  first_detected_inspection_id: string | null
  latest_observed_inspection_id: string | null
  first_detected_at: string
  last_observed_at: string
  observation_count: number
  current_severity: string | null
  max_observed_severity: string | null
  lifecycle_status: string
  needs_review: boolean
  repaired_at: string | null
  resolved_at: string | null
  recurrence_of_case_id: string | null
  latest_evidence_image_id: string | null
  duplicate_alert_suppression_count: number
  observations: Array<{
    id: string
    inspection_id: string
    image_id: string | null
    upload_session_id: string | null
    observation_type: string
    alert_created: boolean
    alert_suppressed: boolean
    severity: string | null
    confidence: number | null
    driver_snapshot: JsonRecord
    observed_at: string
  }>
}

export function VanProfileWorkspace({
  businessId,
  canManage,
  vehicle,
  profileImage,
  fallbackProfileImageId,
  latestSession,
  sessions,
  cases,
}: {
  businessId: string
  canManage: boolean
  vehicle: VanProfileVehicle
  profileImage: VanProfileImage
  fallbackProfileImageId: string | null
  latestSession: VanProfileSession | null
  sessions: VanProfileSession[]
  cases: VanProfileCase[]
}) {
  const [driverFilter, setDriverFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const activeCases = cases.filter((item) => ['active', 'needs_review', 'confirmed', 'repair_scheduled', 'in_repair', 'awaiting_verification', 'recurrent'].includes(item.lifecycle_status))
  const repairedCases = cases.filter((item) => ['repaired', 'resolved'].includes(item.lifecycle_status))
  const driverOptions = useMemo(() => [...new Set(sessions.map((session) => formatDriverName(session.driver_snapshot)).filter(Boolean))], [sessions])
  const dateOptions = useMemo(() => [...new Set(sessions.map((session) => session.upload_started_at.slice(0, 10)))], [sessions])
  const filteredSessions = sessions.filter((session) => {
    const driver = formatDriverName(session.driver_snapshot)
    return (driverFilter === 'all' || driver === driverFilter) && (dateFilter === 'all' || session.upload_started_at.startsWith(dateFilter))
  })
  const daily = dateOptions.map((date) => {
    const daySessions = sessions.filter((session) => session.upload_started_at.startsWith(date))
    return {
      date,
      drivers: [...new Set(daySessions.map((session) => formatDriverName(session.driver_snapshot)))],
      sessions: daySessions.length,
      images: daySessions.reduce((sum, session) => sum + session.image_count, 0),
      completed: daySessions.filter((session) => session.status === 'completed').length,
      newDamage: daySessions.flatMap((session) => session.observations).filter((obs) => obs.observation_type === 'new_damage').length,
      existing: daySessions.flatMap((session) => session.observations).filter((obs) => obs.observation_type === 'existing_damage_observed').length,
      pending: daySessions.filter((session) => session.review_status !== 'reviewed').length,
    }
  })
  const coverImageId = profileImage.imageId || fallbackProfileImageId
  const latestDriver = latestSession ? formatDriverName(latestSession.driver_snapshot) : 'Unknown driver'
  const latestUpload = latestSession ? formatDate(latestSession.upload_started_at) : 'No upload sessions'

  async function copy(value: string | null | undefined) {
    if (value) await navigator.clipboard?.writeText(value).catch(() => undefined)
  }

  return <div className="space-y-6 pb-12">
    <section className="grid overflow-hidden rounded-3xl border border-white/10 bg-graphite-900 md:grid-cols-[minmax(280px,420px)_1fr]">
      <div className="relative min-h-72 bg-black/20">
        {coverImageId ? <SignedDamageImage imageId={coverImageId} businessId={businessId} alt={`${vehicle.name} profile image`} /> : <div className="flex h-full min-h-72 items-center justify-center text-white/30"><ImageIcon className="mr-2 h-8 w-8" />No vehicle image yet</div>}
        <span className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-xs capitalize text-white/70 backdrop-blur">Profile image: {profileImage.mode.replaceAll('_', ' ')}</span>
      </div>
      <div className="p-5 md:p-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[.18em] text-gold-300/70">Fleet vehicle profile</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-white md:text-3xl">{vehicle.name}</h1>
              {vehicle.van_number && <button onClick={() => copy(vehicle.van_number)} className="focus-ring inline-flex items-center rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/50 hover:bg-white/5"><Copy className="mr-1 h-3 w-3" />Van {vehicle.van_number}</button>}
            </div>
            <p className="mt-2 text-sm text-white/45">{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle details unavailable'}{vehicle.plate_number ? ` · ${vehicle.plate_number}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={vehicle.status} />
            <StatusBadge status={activeCases.length ? 'damage_detected' : 'no_damage_detected'} />
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={ShieldAlert} label="Active damage" value={String(activeCases.length)} />
          <Metric icon={History} label="Observations" value={String(cases.reduce((sum, item) => sum + item.observation_count, 0))} />
          <Metric icon={Wrench} label="Repaired cases" value={String(repairedCases.length)} />
          <Metric icon={CalendarDays} label="Upload sessions" value={String(sessions.length)} />
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.025] p-4">
          <div className="flex items-start gap-3">
            <Avatar snapshot={latestSession?.driver_snapshot} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">Images uploaded by {latestDriver}</p>
              <time dateTime={latestSession?.upload_started_at} title={latestSession?.upload_started_at} className="mt-1 block text-xs text-white/40">{latestUpload}</time>
              <p className="mt-2 text-xs text-white/35">Uploader information identifies who submitted inspection images. It does not determine responsibility for damage.</p>
            </div>
            {latestSession && <Link href={`/dashboard/damage-ai/inspections/${latestSession.inspection_id}?businessId=${encodeURIComponent(businessId)}`} className="focus-ring rounded-xl bg-white px-3 py-2 text-xs font-medium text-graphite-950">Open inspection</Link>}
          </div>
        </div>
      </div>
    </section>

    {latestSession && <LatestInspectionCard businessId={businessId} session={latestSession} />}

    <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><h2 className="font-semibold text-white">Driver & upload history</h2><p className="mt-1 text-xs text-white/35">Grouped by date while preserving each Slack message as its own session.</p></div>
            <div className="flex flex-wrap gap-2">
              <select value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)} className="focus-ring rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/65">
                <option value="all">All drivers</option>{driverOptions.map((driver) => <option key={driver} value={driver}>{driver}</option>)}
              </select>
              <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="focus-ring rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/65">
                <option value="all">All dates</option>{dateOptions.map((date) => <option key={date} value={date}>{date}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {filteredSessions.map((session) => <UploadSessionCard key={session.id} businessId={businessId} vehicleId={vehicle.id} session={session} profileImageId={profileImage.imageId} canManage={canManage} />)}
            {!filteredSessions.length && <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/35">No upload sessions match these filters.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5 md:p-6">
          <h2 className="font-semibold text-white">Damage history</h2>
          <p className="mt-1 text-xs text-white/35">Grouped by durable damage case, so repeat observations do not become duplicate alerts.</p>
          <div className="mt-5 grid gap-3">
            {cases.map((damageCase) => <DamageCaseCard key={damageCase.id} businessId={businessId} damageCase={damageCase} />)}
            {!cases.length && <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/35">No damage cases recorded for this van.</p>}
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5">
          <h2 className="text-sm font-semibold text-white">Daily activity</h2>
          <div className="mt-4 space-y-3">{daily.map((day) => <div key={day.date} className="rounded-xl border border-white/8 bg-white/[.02] p-3">
            <p className="text-sm font-medium text-white">{formatDateOnly(day.date)}</p>
            <p className="mt-1 text-xs text-white/35">{day.drivers.join(', ')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-white/45">
              <span>{day.sessions} sessions</span><span>{day.images} images</span>
              <span>{day.newDamage} new damage</span><span>{day.existing} existing observed</span>
              <span>{day.completed} completed</span><span>{day.pending} pending review</span>
            </div>
          </div>)}</div>
        </section>
        <ProfileImageControls businessId={businessId} vehicleId={vehicle.id} canManage={canManage} />
      </aside>
    </section>
  </div>
}

function LatestInspectionCard({ businessId, session }: { businessId: string; session: VanProfileSession }) {
  const counts = countObservations(session.observations)
  return <section className="rounded-2xl border border-gold-400/15 bg-[linear-gradient(135deg,rgba(201,168,76,.08),rgba(20,20,22,1)_45%)] p-5 md:p-6">
    <div className="grid gap-5 lg:grid-cols-[260px_1fr_auto]">
      {session.first_image_id ? <SignedDamageImage imageId={session.first_image_id} businessId={businessId} alt="Latest upload primary image" /> : <div className="flex aspect-video items-center justify-center rounded-xl border border-white/10 text-white/30"><Camera className="h-6 w-6" /></div>}
      <div>
        <p className="text-xs font-medium uppercase tracking-[.16em] text-gold-300/70">Latest inspection</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Uploaded by {formatDriverName(session.driver_snapshot)}</h2>
        <time dateTime={session.upload_started_at} title={session.upload_started_at} className="mt-1 block text-xs text-white/40">{formatDate(session.upload_started_at)}</time>
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/55">{session.inspection?.ai_summary || 'Analysis summary pending.'}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Badge label={`${session.image_count} image${session.image_count === 1 ? '' : 's'}`} />
          <Badge label={`${counts.newDamage} new damage`} />
          <Badge label={`${counts.existing} existing observed`} />
          <Badge label={`${counts.possible} possible duplicate`} />
        </div>
      </div>
      <div className="flex flex-row gap-2 lg:flex-col">
        <StatusBadge status={session.status} />
        <StatusBadge status={session.review_status} />
        <Link href={`/dashboard/damage-ai/inspections/${session.inspection_id}?businessId=${encodeURIComponent(businessId)}`} className="focus-ring inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-medium text-graphite-950">Open <ExternalLink className="ml-1.5 h-3 w-3" /></Link>
      </div>
    </div>
  </section>
}

function UploadSessionCard({ businessId, vehicleId, session, profileImageId, canManage }: { businessId: string; vehicleId: string; session: VanProfileSession; profileImageId: string | null; canManage: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const counts = countObservations(session.observations)
  async function setProfileImage(imageId: string) {
    await fetch(`/api/van-damage/vehicles/${vehicleId}/profile-image?businessId=${encodeURIComponent(businessId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId, mode: 'manual' }),
    })
    startTransition(() => window.location.reload())
  }
  return <article id={`upload-${session.id}`} className="rounded-2xl border border-white/10 bg-white/[.02] p-4">
    <div className="grid gap-4 md:grid-cols-[76px_1fr_auto]">
      {session.first_image_id ? <SignedDamageImage imageId={session.first_image_id} businessId={businessId} alt="Upload session first image" /> : <div className="flex aspect-square items-center justify-center rounded-xl border border-white/10 text-white/30"><ImageIcon className="h-5 w-5" /></div>}
      <div>
        <div className="flex flex-wrap items-center gap-2"><Avatar snapshot={session.driver_snapshot} /><h3 className="font-medium text-white">{formatDriverName(session.driver_snapshot)}</h3><StatusBadge status={session.status} /></div>
        <time dateTime={session.upload_started_at} title={session.upload_started_at} className="mt-2 block text-xs text-white/35">{formatDate(session.upload_started_at)}{session.channelName ? ` · #${session.channelName}` : ''}</time>
        <div className="mt-3 flex flex-wrap gap-2 text-xs"><Badge label={`${session.image_count} images`} /><Badge label={`${counts.newDamage} new`} /><Badge label={`${counts.existing} existing observed`} /><Badge label={`${counts.recurrent} recurrent`} /></div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Link href={`/dashboard/damage-ai/inspections/${session.inspection_id}?businessId=${encodeURIComponent(businessId)}`} className="focus-ring rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5">Inspection</Link>
        {session.slack_permalink && <a href={session.slack_permalink} target="_blank" rel="noreferrer" className="focus-ring rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5">Slack</a>}
        <button onClick={() => setOpen((value) => !value)} className="focus-ring rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5">{open ? 'Collapse' : 'Expand'}</button>
      </div>
    </div>
    {open && <div className="mt-4 border-t border-white/8 pt-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{session.images.map((image) => <div key={image.id} className="relative">
        <SignedDamageImage imageId={image.id} businessId={businessId} alt={`Upload image ${image.upload_order == null ? '' : image.upload_order + 1}`} />
        <div className="mt-2 flex flex-wrap gap-1">
          {image.id === session.first_image_id && <Badge label="First image" />}
          {image.id === profileImageId && <Badge label="Profile image" />}
          <Badge label={`Order ${image.upload_order == null ? '?' : image.upload_order + 1}`} />
          {canManage && <button disabled={pending} onClick={() => setProfileImage(image.id)} className="focus-ring rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/45 hover:bg-white/5">Use profile</button>}
        </div>
      </div>)}</div>
    </div>}
  </article>
}

function DamageCaseCard({ businessId, damageCase }: { businessId: string; damageCase: VanProfileCase }) {
  const [open, setOpen] = useState(false)
  return <article id={`damage-case-${damageCase.id}`} className="rounded-2xl border border-white/10 bg-white/[.02] p-4">
    <div className="grid gap-4 md:grid-cols-[96px_1fr_auto]">
      {damageCase.latest_evidence_image_id ? <SignedDamageImage imageId={damageCase.latest_evidence_image_id} businessId={businessId} alt="Latest damage evidence" /> : <div className="flex aspect-video items-center justify-center rounded-xl border border-white/10 text-white/30"><AlertTriangle className="h-5 w-5" /></div>}
      <div>
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium capitalize text-white">{damageCase.normalized_damage_type.replaceAll('_', ' ')}</h3><StatusBadge status={damageCase.lifecycle_status} />{damageCase.recurrence_of_case_id && <Badge label="Recurrence" />}{damageCase.needs_review && <Badge label="Needs review" />}</div>
        <p className="mt-2 text-xs capitalize text-white/40">{damageCase.canonical_region.replaceAll('_', ' ')} · current {damageCase.current_severity || 'unknown'} · max {damageCase.max_observed_severity || 'unknown'}</p>
        <p className="mt-2 text-xs text-white/35">First detected {formatDate(damageCase.first_detected_at)} · Last observed {formatDate(damageCase.last_observed_at)}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Badge label={`${damageCase.observation_count} observations`} /><Badge label={`${damageCase.duplicate_alert_suppression_count} duplicate alerts suppressed`} /><Badge label={`${damageCase.observations.filter((item) => item.alert_created).length} alerts created`} /></div>
      </div>
      <button onClick={() => setOpen((value) => !value)} className="focus-ring self-start rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5">{open ? 'Hide timeline' : 'Timeline'}</button>
    </div>
    {open && <ol className="mt-4 space-y-3 border-t border-white/8 pt-4">{damageCase.observations.map((observation) => <li key={observation.id} className="grid gap-3 rounded-xl border border-white/8 bg-black/10 p-3 md:grid-cols-[1fr_auto]">
      <div><p className="text-sm capitalize text-white/65">{observation.observation_type.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-white/35">{formatDriverName(observation.driver_snapshot)} · {formatDate(observation.observed_at)}</p></div>
      <Link href={`/dashboard/damage-ai/inspections/${observation.inspection_id}?businessId=${encodeURIComponent(businessId)}`} className="focus-ring rounded-lg text-xs text-gold-300 hover:text-gold-200">Open inspection</Link>
    </li>)}</ol>}
  </article>
}

function ProfileImageControls({ businessId, vehicleId, canManage }: { businessId: string; vehicleId: string; canManage: boolean }) {
  const [pending, startTransition] = useTransition()
  if (!canManage) return null
  async function restoreAutomatic() {
    await fetch(`/api/van-damage/vehicles/${vehicleId}/profile-image?businessId=${encodeURIComponent(businessId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'automatic_first_upload' }),
    })
    startTransition(() => window.location.reload())
  }
  async function removeManual() {
    await fetch(`/api/van-damage/vehicles/${vehicleId}/profile-image?businessId=${encodeURIComponent(businessId)}`, {
      method: 'DELETE',
    })
    startTransition(() => window.location.reload())
  }
  return <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5">
    <h2 className="text-sm font-semibold text-white">Profile image</h2>
    <p className="mt-2 text-xs leading-5 text-white/35">Admins can restore the automatic first uploaded image or remove a manual selection. Original S3 images stay private.</p>
    <div className="mt-4 flex flex-wrap gap-2"><button disabled={pending} onClick={restoreAutomatic} className="focus-ring inline-flex items-center rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Restore automatic</button><button disabled={pending} onClick={removeManual} className="focus-ring rounded-xl border border-red-400/15 px-3 py-2 text-xs text-red-200/70 hover:bg-red-400/10">Remove manual</button></div>
  </section>
}

function Metric({ icon: Icon, label, value }: { icon: typeof ShieldAlert; label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[.025] p-4"><Icon className="h-4 w-4 text-gold-300/75" /><p className="mt-3 text-xl font-semibold text-white">{value}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-white/30">{label}</p></div>
}
function Badge({ label }: { label: string }) {
  return <span className="inline-flex rounded-full border border-white/10 bg-white/[.04] px-2 py-0.5 text-[10px] text-white/45">{label}</span>
}
function Avatar({ snapshot }: { snapshot?: JsonRecord | null }) {
  const name = formatDriverName(snapshot)
  const avatar = typeof snapshot?.avatarUrl === 'string' ? snapshot.avatarUrl : null
  if (avatar) {
    // Slack avatar snapshots are HTTPS profile images, not durable private S3 references.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt="" className="h-9 w-9 rounded-full border border-white/10 object-cover" />
  }
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[.04] text-xs font-semibold text-white/60">{initials(name)}</span>
}
function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || <UserRound className="h-4 w-4" />
}
function formatDate(value: string | null | undefined) {
  if (!value) return 'Pending'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short' }).format(new Date(value))
}
function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00Z`))
}
function countObservations(observations: Array<{ observation_type: string }>) {
  return {
    newDamage: observations.filter((item) => item.observation_type === 'new_damage').length,
    existing: observations.filter((item) => item.observation_type === 'existing_damage_observed').length,
    possible: observations.filter((item) => item.observation_type === 'possible_duplicate').length,
    recurrent: observations.filter((item) => item.observation_type === 'recurrent_damage').length,
  }
}
