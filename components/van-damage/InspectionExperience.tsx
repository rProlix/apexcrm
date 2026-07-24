'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  Archive,
  ArrowLeft,
  Bot,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleGauge,
  Clipboard,
  Clock3,
  Copy,
  DownloadCloud,
  ExternalLink,
  FileCheck2,
  FileJson,
  Filter,
  Gauge,
  History,
  ImageIcon,
  Info,
  Keyboard,
  Link2,
  MapPin,
  MessageSquare,
  PackageCheck,
  PanelTop,
  Paperclip,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Star,
  ThumbsDown,
  UserRound,
  Warehouse,
  Wrench,
  X,
} from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { InspectionPeriodBadge } from './InspectionPeriodBadge'
import { DamageImageGallery } from './DamageImageGallery'
import { SignedDamageImage } from './SignedDamageImage'
import { FordTransit2019DamageMap } from './FordTransit2019DamageMap'
import type { DamageImage, DamageItem } from './inspection-types'
import { formatInspectionTimestamp, getInspectionPeriod } from '@/lib/van-damage/inspection-period'
import {
  getTransitViewForRegion,
  resolveItemTransitRegion,
  transitRegionMatches,
  type TransitView,
} from '@/lib/van-damage/transit-blueprint'
import { formatDriverName } from '@/lib/van-damage/history'

type RecordValue = Record<string, unknown>
type RelatedInspection = {
  id: string
  status: string
  damage_count: number
  ai_confidence: number | null
  created_at: string
}
type Vehicle = {
  id: string
  name: string
  van_number: string | null
  make: string | null
  model: string | null
  year: number | null
  color: string | null
  plate_number: string | null
  vin: string | null
  status: string
  metadata: RecordValue
} | null
type VehicleResolution = {
  state: 'resolved' | 'ambiguous' | 'missing'
  source: 'inspection_van_id' | 'upload_session_van_id' | 'legacy_van_number' | 'none'
}
type VehicleImage = {
  imageId: string | null
  source:
    | 'primary_profile'
    | 'featured_fleet'
    | 'approved_vehicle_image'
    | 'automatic_first_upload'
    | 'placeholder'
}
type OwnerMetadata = {
  source: {
    workspace: string | null
    channel: string | null
    messageTimestamp: string | null
    uploadSessionId: string | null
  }
  processing: {
    inspectionCreatedAt: string
    analysisStartedAt: string | null
    analysisCompletedAt: string | null
    retryCount: number
    workerStatus: string | null
    workerVersion: string | null
  }
  storage: {
    imageCount: number
    provider: string
    cache: string
  }
  database: {
    inspectionId: string
    vehicleId: string | null
    damageCaseIds: string[]
    createdAt: string
    updatedAt: string
  }
  vehicleResolution: VehicleResolution
}
type Inspection = {
  id: string
  title: string | null
  status: string
  review_status: string
  source: string
  image_count: number
  damage_count: number
  ai_summary: string | null
  ai_confidence: number | null
  van_id: string | null
  metadata: RecordValue
  created_at: string
  updated_at: string
  completed_at: string | null
  reviewed_at: string | null
}
type AiRun = {
  id: string
  status: string
  parsed_response: RecordValue
  created_at: string
  completed_at: string | null
} | null
type Job = {
  status: string
  attempt_count: number
  created_at: string
  started_at: string | null
  completed_at: string | null
} | null

export type InspectionExperienceProps = {
  businessId: string
  returnHref?: string
  tenantName: string
  timeZone: string
  canManage: boolean
  canViewMetadata: boolean
  uploaderName: string
  inspectionTimestamp: string
  inspection: Inspection
  vehicle: Vehicle
  vehicleResolution: VehicleResolution
  vehicleImage: VehicleImage
  vehicleStats: {
    activeLevel3Count: number
    activeMaintenanceCount: number
    lastInspectionAt: string
  }
  images: DamageImage[]
  items: DamageItem[]
  aiRun: AiRun
  job: Job
  related: RelatedInspection[]
  ownerMetadata: OwnerMetadata | null
  slack: { workspace: string | null; channel: string | null; url: string | null }
}

const severityRank: Record<string, number> = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 }
const severityPresentation = {
  minor: {
    label: 'Minor',
    color: 'emerald',
    classes: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  },
  moderate: {
    label: 'Moderate',
    color: 'amber',
    classes: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  },
  major: {
    label: 'Major',
    color: 'orange',
    classes: 'border-orange-400/20 bg-orange-400/10 text-orange-200',
  },
  critical: {
    label: 'Critical',
    color: 'red',
    classes: 'border-red-400/20 bg-red-400/10 text-red-200',
  },
} as const

function asRecord(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {}
}
function asRecordArray(value: unknown): RecordValue[] {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === 'object') as RecordValue[])
    : []
}
function asText(value: unknown, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value : fallback
}
function formatDateInZone(value: string | null | undefined, timeZone: string) {
  return formatInspectionTimestamp(value, { timeZone })
}
function formatDuration(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return '—'
  const seconds = Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  )
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
function humanize(value: string | null | undefined) {
  return value ? value.replaceAll('_', ' ') : 'Unknown'
}
function isProcessing(status: string) {
  return ['queued', 'processing', 'pending', 'downloading', 'analyzing'].includes(status)
}
function confidenceLabel(value: number | null | undefined) {
  if (value == null) return 'Confidence unavailable'
  return value >= 0.8 ? 'High confidence' : value >= 0.55 ? 'Medium confidence' : 'Low confidence'
}
function uniqueTexts(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

export function InspectionExperience(props: InspectionExperienceProps) {
  const { inspection, items, images, aiRun, vehicle, related } = props
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [mapView, setMapView] = useState<TransitView>('passenger')
  const [mapAnnouncement, setMapAnnouncement] = useState('')
  const [sortBy, setSortBy] = useState<'severity' | 'confidence' | 'newest'>('severity')
  const [bookmarked, setBookmarked] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const parsed = asRecord(aiRun?.parsed_response)
  const rating = typeof parsed.damageRating === 'number' ? parsed.damageRating : null
  const confidence =
    typeof parsed.overallConfidence === 'number'
      ? parsed.overallConfidence
      : inspection.ai_confidence
  const maxSeverity = items.reduce(
    (best, item) =>
      severityRank[item.severity ?? 'unknown'] > severityRank[best]
        ? (item.severity ?? 'unknown')
        : best,
    'unknown'
  )
  const severityKey: keyof typeof severityPresentation =
    maxSeverity === 'critical'
      ? 'critical'
      : rating === 3 || maxSeverity === 'high'
        ? 'major'
        : rating === 2 || maxSeverity === 'medium'
          ? 'moderate'
          : 'minor'
  const severity = severityPresentation[severityKey]
  const needsReview =
    inspection.status === 'needs_review' ||
    parsed.needsHumanReview === true ||
    inspection.review_status === 'in_review'
  const safetyConcern =
    maxSeverity === 'critical' ||
    items.some((item) =>
      ['broken_light', 'broken_mirror', 'glass_damage', 'tire_wheel_damage'].includes(
        item.damage_type ?? ''
      )
    )
  const safeToRent =
    rating == null
      ? 'Pending'
      : rating <= 1 && !safetyConcern
        ? 'Likely safe'
        : rating === 2 && !safetyConcern
          ? 'Review first'
          : 'Hold for review'
  const outOfService =
    maxSeverity === 'critical'
      ? 'Recommended'
      : rating === 3
        ? 'Assess before use'
        : 'Not indicated'
  const vehicleMeta = asRecord(vehicle?.metadata)
  const mileage = vehicleMeta.mileage ?? vehicleMeta.odometer ?? vehicleMeta.currentMileage
  const panels = [
    ...new Set(
      items.map((item) => humanize(item.vehicle_area)).filter((value) => value !== 'Unknown')
    ),
  ]
  const recommendation =
    items[0]?.repair_recommendation ||
    (rating === 0
      ? 'No repair action indicated. Continue routine fleet checks.'
      : 'Complete a human review before returning this vehicle to service.')
  const phase = asRecord(inspection.metadata.phase3c)
  const lifecycle = asText(phase.lifecycle, inspection.review_status)
  const processing =
    isProcessing(inspection.status) || Boolean(props.job && isProcessing(props.job.status))
  const inspectionPeriod = getInspectionPeriod(props.inspectionTimestamp, props.timeZone)
  const newDamageCount = items.filter((item) => item.observation_type === 'new_damage').length
  const existingDamageCount = items.filter(
    (item) => item.observation_type === 'existing_damage_observed'
  ).length
  const level3Items = items.filter((item) =>
    ['high', 'critical', 'level_3'].includes(item.severity ?? '')
  )
  const findingsNeedingReview = items.filter(
    (item) =>
      ['high', 'critical'].includes(item.severity ?? '') ||
      item.first_attribution?.needsReview === true
  ).length
  const severityOptions = uniqueTexts(items.map((item) => item.severity))
  const areaOptions = useMemo(
    () => uniqueTexts(items.map((item) => resolveItemTransitRegion(item))),
    [items]
  )
  const filteredItems = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase()
    return [...items]
      .filter((item) => severityFilter === 'all' || item.severity === severityFilter)
      .filter((item) => areaFilter === 'all' || transitRegionMatches(areaFilter, item))
      .filter((item) => {
        if (!lowerQuery) return true
        return [
          item.damage_type,
          item.vehicle_area,
          item.severity,
          item.description,
          item.repair_recommendation,
        ].some((value) => value?.toLowerCase().includes(lowerQuery))
      })
      .sort((a, b) => {
        if (sortBy === 'confidence') return (b.confidence ?? -1) - (a.confidence ?? -1)
        if (sortBy === 'newest')
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        return severityRank[b.severity ?? 'unknown'] - severityRank[a.severity ?? 'unknown']
      })
  }, [areaFilter, items, query, severityFilter, sortBy])

  const copyText = useCallback(async (value: string) => {
    await navigator.clipboard?.writeText(value).catch(() => undefined)
  }, [])

  const selectMapRegion = useCallback(
    (regionId: string | null, view: TransitView, imageId?: string | null) => {
      setMapView(view)
      setAreaFilter(regionId ?? 'all')
      setMapAnnouncement(
        regionId
          ? `${humanize(regionId)} selected in the ${humanize(view)} view.`
          : 'Vehicle region selection cleared.'
      )
      if (imageId)
        window.dispatchEvent(new CustomEvent('van-damage:focus-image', { detail: imageId }))
      if (window.location.hash.startsWith('#damage-region-') || regionId) {
        const nextUrl = `${window.location.pathname}${window.location.search}${regionId ? `#damage-region-${regionId}` : ''}`
        window.history.replaceState(null, '', nextUrl)
      }
    },
    []
  )

  const focusFindingOnMap = useCallback((item: DamageItem, scroll = true) => {
    const regionId = resolveItemTransitRegion(item)
    if (regionId) {
      setMapView(getTransitViewForRegion(regionId))
      setAreaFilter(regionId)
      setMapAnnouncement(`${humanize(regionId)} selected for ${humanize(item.damage_type)}.`)
    }
    if (item.image_id)
      window.dispatchEvent(new CustomEvent('van-damage:focus-image', { detail: item.image_id }))
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#finding-${item.id}`
    )
    if (scroll)
      document
        .getElementById('vehicle-damage-map')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  useEffect(() => {
    setBookmarked(localStorage.getItem(`vanDamageBookmark:${inspection.id}`) === '1')
    setFavorite(localStorage.getItem(`vanDamageFavorite:${inspection.id}`) === '1')
    const hash = window.location.hash.replace('#', '')
    if (hash.startsWith('finding-')) {
      document.getElementById(hash)?.scrollIntoView({ block: 'center' })
      const item = items.find((candidate) => candidate.id === hash.slice('finding-'.length))
      if (item) focusFindingOnMap(item, false)
    }
    if (hash.startsWith('damage-region-')) {
      const regionId = hash.slice('damage-region-'.length)
      setAreaFilter(regionId)
      setMapView(getTransitViewForRegion(regionId))
    }
  }, [focusFindingOnMap, inspection.id, items])

  useEffect(() => {
    const selectFinding = (event: Event) => {
      const findingId = (event as CustomEvent<string>).detail
      const item = items.find((candidate) => candidate.id === findingId)
      if (item) focusFindingOnMap(item)
    }
    window.addEventListener('van-damage:select-finding', selectFinding)
    return () => window.removeEventListener('van-damage:select-finding', selectFinding)
  }, [focusFindingOnMap, items])

  useEffect(() => {
    if (!processing) return
    const interval = window.setInterval(() => router.refresh(), 10_000)
    return () => window.clearInterval(interval)
  }, [processing, router])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return
      if (event.key === '/') {
        event.preventDefault()
        document.getElementById('finding-search')?.focus()
      }
      if (event.key.toLowerCase() === 'p') window.print()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function toggleStored(key: 'bookmark' | 'favorite') {
    const storageKey =
      key === 'bookmark'
        ? `vanDamageBookmark:${inspection.id}`
        : `vanDamageFavorite:${inspection.id}`
    const next = localStorage.getItem(storageKey) !== '1'
    localStorage.setItem(storageKey, next ? '1' : '0')
    if (key === 'bookmark') setBookmarked(next)
    else setFavorite(next)
  }

  function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      inspection: {
        id: inspection.id,
        status: inspection.status,
        review_status: inspection.review_status,
        created_at: inspection.created_at,
        completed_at: inspection.completed_at,
        ai_confidence: inspection.ai_confidence,
        ai_summary: inspection.ai_summary,
      },
      vehicle,
      ai: {
        analysis_status: aiRun?.status || inspection.status,
        parsed_response: parsed,
      },
      images,
      findings: items,
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `van-damage-${inspection.id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 pb-12">
      <style jsx global>{`
        @media print {
          nav,
          aside,
          .no-print {
            display: none !important;
          }
          body {
            background: #fff !important;
            color: #111 !important;
          }
          main,
          section,
          article {
            break-inside: avoid;
          }
          .print\\:bg-white {
            background: #fff !important;
          }
          .print\\:text-black {
            color: #111 !important;
          }
        }
      `}</style>
      <section
        id="inspection-summary"
        className="scroll-mt-20 overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_80%_0%,rgba(201,168,76,.12),transparent_32%),linear-gradient(135deg,#18181b,#101012)] shadow-panel-lg"
      >
        <div className="border-b border-white/8 px-5 py-4 md:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href={
                  props.returnHref ||
                  `/dashboard/damage-ai?businessId=${encodeURIComponent(props.businessId)}`
                }
                className="focus-ring rounded-xl border border-white/10 p-2 text-white/55 hover:bg-white/5 hover:text-white"
                aria-label="Back to inspections"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase tracking-[.18em] text-gold-300/75">
                  {inspectionPeriod.label} inspection
                </p>
                <h1 className="mt-1 truncate text-xl font-semibold text-white md:text-2xl">
                  {vehicle?.van_number
                    ? `Van ${vehicle.van_number}`
                    : vehicle?.name || inspection.title || 'Unlinked vehicle inspection'}
                </h1>
                <p className="mt-1 text-xs text-white/45">
                  {formatDateInZone(props.inspectionTimestamp, props.timeZone)} · Uploaded by{' '}
                  {props.uploaderName}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={inspection.status} />
              <InspectionPeriodBadge
                timestamp={props.inspectionTimestamp}
                timeZone={props.timeZone}
                showLabel
              />
              <StatusBadge status={inspection.review_status} />
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${severity.classes}`}
              >
                {severity.label} severity
              </span>
              {level3Items.length > 0 && (
                <span className="inline-flex items-center rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-xs font-medium text-red-100">
                  <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
                  Level 3 damage
                </span>
              )}
              {needsReview && (
                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-100">
                  Human review required
                </span>
              )}
              {props.canViewMetadata && (
                <button
                  onClick={() => copyText(inspection.id)}
                  className="focus-ring no-print inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs text-white/55 hover:bg-white/5 hover:text-white"
                >
                  <Copy className="mr-1.5 h-3 w-3" />
                  Copy ID
                </button>
              )}
              <button
                onClick={() => toggleStored('bookmark')}
                aria-pressed={bookmarked}
                className="focus-ring no-print rounded-full border border-white/10 p-1.5 text-white/45 hover:bg-white/5 hover:text-white"
                title="Bookmark inspection"
              >
                <Clipboard
                  className={`h-3.5 w-3.5 ${bookmarked ? 'fill-gold-300 text-gold-300' : ''}`}
                />
              </button>
              <button
                onClick={() => toggleStored('favorite')}
                aria-pressed={favorite}
                className="focus-ring no-print rounded-full border border-white/10 p-1.5 text-white/45 hover:bg-white/5 hover:text-white"
                title="Favorite inspection"
              >
                <Star className={`h-3.5 w-3.5 ${favorite ? 'fill-gold-300 text-gold-300' : ''}`} />
              </button>
              <button
                onClick={() => window.print()}
                className="focus-ring no-print rounded-full border border-white/10 p-1.5 text-white/45 hover:bg-white/5 hover:text-white"
                title="Print report"
              >
                <Printer className="h-3.5 w-3.5" />
              </button>
              {props.canViewMetadata && (
                <button
                  onClick={exportJson}
                  className="focus-ring no-print rounded-full border border-white/10 p-1.5 text-white/45 hover:bg-white/5 hover:text-white"
                  title="Export JSON"
                >
                  <FileJson className="h-3.5 w-3.5" />
                </button>
              )}
              {props.slack.url && (
                <a
                  href={props.slack.url}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs text-white/55 hover:bg-white/5 hover:text-white"
                >
                  Open in Slack <ExternalLink className="ml-1.5 h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[.85fr_1.3fr_1fr]">
          <div
            id="vehicle-profile"
            className="scroll-mt-20 border-b border-white/8 p-5 md:p-7 lg:border-b-0 lg:border-r"
          >
            <p className="text-xs font-medium uppercase tracking-[.16em] text-white/35">
              Inspection status
            </p>
            <div className="mt-5 flex items-end gap-3">
              <ConfidenceRing value={confidence} />
              <div className="pb-1">
                <p className="text-xs text-white/35">AI confidence</p>
                <p className="text-lg font-semibold text-white">
                  {confidence == null
                    ? 'Pending'
                    : confidence >= 0.8
                      ? 'High confidence'
                      : confidence >= 0.55
                        ? 'Medium confidence'
                        : 'Low confidence'}
                </p>
              </div>
            </div>
            <dl className="mt-6 space-y-3 text-xs">
              <MetaRow label="Period" value={inspectionPeriod.label} />
              <MetaRow
                label="Captured"
                value={formatDateInZone(props.inspectionTimestamp, props.timeZone)}
              />
              <MetaRow label="Uploaded by" value={props.uploaderName} />
              <MetaRow
                label="Analysis"
                value={processing ? 'In progress' : humanize(inspection.status)}
              />
              <MetaRow label="Review" value={needsReview ? 'Required' : humanize(lifecycle)} />
            </dl>
          </div>

          <div className="border-b border-white/8 p-5 md:p-7 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-[.16em] text-white/35">
                Vehicle profile
              </p>
              <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-1 text-[10px] capitalize text-white/55">
                <span
                  className={`mr-1.5 h-1.5 w-1.5 rounded-full ${vehicle?.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'}`}
                />
                {vehicle?.status || 'unmatched'}
              </span>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-[140px_1fr]">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-white/[.03]">
                {vehicle && props.vehicleImage.imageId ? (
                  <SignedDamageImage
                    imageId={props.vehicleImage.imageId}
                    businessId={props.businessId}
                    alt={`${vehicle.name} profile image`}
                    sizes="140px"
                    eager
                    fillContainer
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-3 text-center text-white/30">
                    <ImageIcon className="mb-2 h-7 w-7" />
                    <span className="text-[10px]">
                      {vehicle
                        ? 'No profile image has been added for this van.'
                        : props.vehicleResolution.state === 'ambiguous'
                          ? 'Vehicle link needs review.'
                          : 'No linked vehicle'}
                    </span>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-white">
                  {vehicle?.name ||
                    (props.vehicleResolution.state === 'ambiguous'
                      ? 'Vehicle match is ambiguous'
                      : 'No vehicle profile linked')}
                </h2>
                <p className="mt-1 text-sm text-white/45">
                  {vehicle
                    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
                      'Vehicle specifications have not been added.'
                    : props.vehicleResolution.state === 'ambiguous'
                      ? 'This inspection could not be linked to a single vehicle profile.'
                      : 'No vehicle profile is linked to this inspection.'}
                </p>
                {vehicle && (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {(typeof mileage === 'number' || typeof mileage === 'string') && (
                        <MiniStat label="Mileage" value={Number(mileage).toLocaleString()} />
                      )}
                      {vehicle.plate_number && (
                        <MiniStat label="Plate" value={vehicle.plate_number} />
                      )}
                      <MiniStat
                        label="Level 3"
                        value={`${props.vehicleStats.activeLevel3Count} active`}
                      />
                      <MiniStat
                        label="Maintenance"
                        value={`${props.vehicleStats.activeMaintenanceCount} active`}
                      />
                    </div>
                    <Link
                      href={`/dashboard/vehicles/${vehicle.id}?businessId=${encodeURIComponent(props.businessId)}`}
                      className="focus-ring no-print mt-4 inline-flex min-h-10 items-center rounded-xl border border-white/10 px-3 text-xs font-medium text-white/65 hover:bg-white/5"
                    >
                      Open Van Profile
                      <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="p-5 md:p-7">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-[.16em] text-white/35">
                AI verdict
              </p>
              <Sparkles className="h-4 w-4 text-gold-300" />
            </div>
            <p className="mt-4 text-2xl font-semibold capitalize text-white">
              {humanize(asText(parsed.vehicleCondition, 'Analysis pending'))}
            </p>
            <p className="mt-1 text-sm capitalize text-white/45">
              {rating == null
                ? 'Damage rating pending'
                : `${rating}/3 · ${humanize(asText(parsed.damageRatingLabel))}`}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <VerdictState
                label="Safe to rent"
                value={safeToRent}
                tone={safeToRent === 'Likely safe' ? 'good' : 'warn'}
              />
              <VerdictState
                label="Needs review"
                value={needsReview ? 'Yes' : 'No'}
                tone={needsReview ? 'warn' : 'good'}
              />
              <VerdictState
                label="Out of service"
                value={outOfService}
                tone={outOfService === 'Not indicated' ? 'good' : 'bad'}
              />
            </div>
            <p className="mt-5 line-clamp-3 text-xs leading-5 text-white/50">{recommendation}</p>
            {processing && (
              <p className="mt-3 inline-flex items-center rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-[10px] text-sky-200">
                <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" />
                Live refresh active
              </p>
            )}
          </div>
        </div>
      </section>

      <nav
        aria-label="Inspection report sections"
        className="no-print rounded-2xl border border-white/10 bg-graphite-900/90 p-2 backdrop-blur"
      >
        <div className="flex flex-wrap gap-1">
          {[
            ['Summary', '#inspection-summary'],
            ['Vehicle', '#vehicle-profile'],
            ...(level3Items.length ? [['Critical Findings', '#critical-findings']] : []),
            ['Damage Map', '#vehicle-damage-map'],
            ['Images', '#inspection-images'],
            ['Findings', '#damage-findings'],
            ['Timeline', '#inspection-timeline'],
            ...(props.canViewMetadata ? [['Inspection Metadata', '#inspection-metadata']] : []),
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="focus-ring min-h-10 rounded-xl px-3 py-2 text-xs font-medium text-white/55 hover:bg-white/5 hover:text-white"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      <section
        aria-label="Inspection status summary"
        className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-6"
      >
        {[
          ['Images received', String(images.length)],
          ['New damage', String(newDamageCount)],
          ['Existing observed', String(existingDamageCount)],
          ['Level 3 findings', String(level3Items.length)],
          ['Need review', String(findingsNeedingReview)],
          ['Analysis', processing ? 'In progress' : humanize(inspection.status)],
        ].map(([label, value]) => (
          <div key={label} className="bg-graphite-800 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/35">{label}</p>
            <p className="mt-1 text-sm font-semibold capitalize text-white">{value}</p>
          </div>
        ))}
      </section>

      <WorkflowActions {...props} />

      {level3Items.length > 0 && (
        <section
          id="critical-findings"
          aria-labelledby="critical-findings-title"
          className="scroll-mt-20 overflow-hidden rounded-2xl border border-red-400/25 bg-red-400/[.055]"
        >
          <div className="border-b border-red-400/15 px-5 py-4 md:px-6">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-200" />
              <h2 id="critical-findings-title" className="font-semibold text-white">
                Critical Findings
              </h2>
            </div>
            <p className="mt-1 text-xs text-red-100/55">
              Level 3 findings are shown first because they may require operational action.
            </p>
          </div>
          <div className="divide-y divide-red-400/15">
            {level3Items.map((item) => (
              <article
                key={item.id}
                className="grid gap-4 px-5 py-5 md:px-6 lg:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium capitalize text-white">
                      {humanize(item.vehicle_area)} · {humanize(item.damage_type)}
                    </h3>
                    <StatusBadge status={item.severity ?? 'high'} />
                    {item.first_attribution?.needsReview && (
                      <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-100">
                        Needs review
                      </span>
                    )}
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
                    {item.description || 'A severe visible condition requires human review.'}
                  </p>
                  {item.first_attribution && (
                    <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <MetaRow
                        label="First detected"
                        value={formatDateInZone(
                          item.first_attribution.sourceTimestamp,
                          props.timeZone
                        )}
                      />
                      <MetaRow
                        label="First reported by"
                        value={formatDriverName(item.first_attribution.reporter)}
                      />
                      <MetaRow
                        label="Last observed"
                        value={formatDateInZone(
                          item.first_attribution.lastObservedAt,
                          props.timeZone
                        )}
                      />
                      <MetaRow
                        label="Latest uploader"
                        value={formatDriverName(item.first_attribution.latestUploader)}
                      />
                      <MetaRow
                        label="Observations"
                        value={String(item.first_attribution.observationCount)}
                      />
                      <MetaRow
                        label="Repair status"
                        value={humanize(item.first_attribution.repairStatus)}
                      />
                    </dl>
                  )}
                  <p className="mt-4 text-xs leading-5 text-white/40">
                    Reporter information identifies who submitted the inspection images and does not
                    determine who caused the damage.
                  </p>
                </div>
                {item.image_id && (
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('van-damage:focus-image', { detail: item.image_id })
                      )
                    }
                    className="focus-ring no-print min-h-11 self-start rounded-xl border border-red-300/20 px-4 text-sm font-medium text-red-100 hover:bg-red-300/10"
                  >
                    View evidence
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0 space-y-6">
          <section
            id="inspection-images"
            className="scroll-mt-20 rounded-2xl border border-white/10 bg-graphite-800 p-5 md:p-6"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-xl border border-gold-400/20 bg-gold-400/10 p-2.5">
                <Bot className="h-5 w-5 text-gold-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-[.16em] text-gold-300/70">
                  AI damage summary
                </p>
                <p className="mt-3 text-base leading-7 text-white/75">
                  {inspection.ai_summary ||
                    asText(parsed.summary, 'Analysis has not completed yet.')}
                </p>
                <p className="mt-3 text-xs leading-5 text-white/35">
                  AI-generated findings should be reviewed by an authorized person before repair or
                  responsibility decisions are made.
                </p>
                <p className="mt-1 text-xs leading-5 text-white/35">
                  Reporter information identifies who submitted the inspection images and does not
                  determine who caused the damage.
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryMetric
                icon={PanelTop}
                label="Detected damage"
                value={`${inspection.damage_count} finding${inspection.damage_count === 1 ? '' : 's'}`}
              />
              <SummaryMetric
                icon={MapPin}
                label="Panels affected"
                value={panels.length ? panels.join(', ') : 'None identified'}
              />
              <SummaryMetric icon={CircleGauge} label="Estimated severity" value={severity.label} />
              <SummaryMetric
                icon={Wrench}
                label="Repair priority"
                value={repairPriority(severityKey)}
              />
              <SummaryMetric
                icon={ShieldAlert}
                label="Safety concerns"
                value={safetyConcern ? 'Potential concern' : 'None indicated'}
              />
              <SummaryMetric icon={Warehouse} label="Rental impact" value={safeToRent} />
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5 md:p-6">
            <DamageImageGallery images={images} items={items} businessId={props.businessId} />
          </section>

          <section
            id="vehicle-damage-map"
            className="grid scroll-mt-24 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]"
          >
            <FordTransit2019DamageMap
              vehicle={vehicle}
              items={items}
              images={images}
              activeView={mapView}
              selectedRegion={areaFilter === 'all' ? null : areaFilter}
              inspectionNeedsReview={needsReview}
              lifecycle={lifecycle}
              onViewChange={setMapView}
              onSelectRegion={selectMapRegion}
            />
            <SeverityPanel items={items} active={severityKey} />
          </section>
          <p className="sr-only" aria-live="polite">
            {mapAnnouncement}
          </p>

          <section
            id="damage-findings"
            className="scroll-mt-20 overflow-hidden rounded-2xl border border-white/10 bg-graphite-800"
          >
            <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-4 md:px-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="font-semibold text-white">Damage findings</h2>
                <p className="mt-1 text-xs text-white/35">
                  AI-detected regions and repair guidance
                </p>
              </div>
              <div className="no-print flex flex-wrap gap-2">
                <label className="focus-within:focus-ring flex min-w-48 items-center rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/55">
                  <Search className="mr-2 h-3.5 w-3.5 text-white/30" />
                  <input
                    id="finding-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search findings"
                    className="w-full bg-transparent outline-none placeholder:text-white/25"
                  />
                </label>
                <label className="flex items-center rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/55">
                  <Filter className="mr-2 h-3.5 w-3.5 text-white/30" />
                  <select
                    value={severityFilter}
                    onChange={(event) => setSeverityFilter(event.target.value)}
                    className="bg-transparent capitalize outline-none"
                  >
                    <option value="all">All severity</option>
                    {severityOptions.map((option) => (
                      <option key={option} value={option}>
                        {humanize(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/55">
                  <MapPin className="mr-2 h-3.5 w-3.5 text-white/30" />
                  <select
                    value={areaFilter}
                    onChange={(event) => {
                      const regionId = event.target.value
                      setAreaFilter(regionId)
                      if (regionId !== 'all') setMapView(getTransitViewForRegion(regionId))
                    }}
                    className="bg-transparent capitalize outline-none"
                  >
                    <option value="all">All areas</option>
                    {areaOptions.map((option) => (
                      <option key={option} value={option}>
                        {humanize(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/55">
                  <ArrowUpDownIcon />
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                    className="bg-transparent outline-none"
                  >
                    <option value="severity">Severity</option>
                    <option value="confidence">Confidence</option>
                    <option value="newest">Newest</option>
                  </select>
                </label>
              </div>
            </div>
            {items.length ? (
              <div className="divide-y divide-white/8">
                {filteredItems.map((item, index) => (
                  <article
                    id={`finding-${item.id}`}
                    key={item.id}
                    className="grid gap-4 px-5 py-5 md:grid-cols-[44px_1fr_auto] md:px-6"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[.03] text-sm font-semibold text-white/45">
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium capitalize text-white">
                          {humanize(item.damage_type)}
                        </h3>
                        <StatusBadge status={item.severity || 'unknown'} />
                        {item.observation_type && (
                          <span className="rounded-full border border-white/10 bg-white/[.04] px-2 py-0.5 text-[10px] capitalize text-white/45">
                            {humanize(item.observation_type)}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-white/55">
                        {item.description || 'No description supplied.'}
                      </p>
                      <div className="mt-3 grid gap-2 text-[11px] text-white/40 sm:grid-cols-3">
                        <span>
                          Area:{' '}
                          <span className="capitalize text-white/60">
                            {humanize(item.vehicle_area)}
                          </span>
                        </span>
                        <span>
                          Review:{' '}
                          <span className="text-white/60">
                            {item.damage_case_id
                              ? 'Linked to damage case'
                              : 'AI opinion pending human decision'}
                          </span>
                        </span>
                        <span>
                          Safety:{' '}
                          <span className="text-white/60">
                            {['critical', 'high'].includes(item.severity ?? '')
                              ? 'Inspect before use'
                              : 'No safety issue stated'}
                          </span>
                        </span>
                      </div>
                      {item.repair_recommendation && (
                        <p className="mt-3 flex items-start text-xs leading-5 text-amber-100/60">
                          <Wrench className="mr-2 mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {item.repair_recommendation}
                        </p>
                      )}
                      {['high', 'critical'].includes(item.severity ?? '') &&
                      item.first_attribution ? (
                        <div className="mt-3 rounded-xl border border-red-300/10 bg-red-300/[.035] p-3 text-xs text-white/45">
                          <p className="text-white/70">
                            First reported by {formatDriverName(item.first_attribution.reporter)}
                          </p>
                          <p className="mt-1">
                            First detected{' '}
                            {formatDateInZone(
                              item.first_attribution.sourceTimestamp,
                              props.timeZone
                            )}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {item.first_attribution.inspectionId ? (
                              <Link
                                href={`/dashboard/damage-ai/inspections/${item.first_attribution.inspectionId}?businessId=${encodeURIComponent(props.businessId)}`}
                                className="text-red-100/70 underline underline-offset-2"
                              >
                                Original inspection
                              </Link>
                            ) : null}
                            {item.first_attribution.uploadSessionId ? (
                              <span>
                                Session {item.first_attribution.uploadSessionId.slice(0, 8)}
                              </span>
                            ) : null}
                            {item.first_attribution.evidenceImageId ? (
                              <span>
                                Evidence {item.first_attribution.evidenceImageId.slice(0, 8)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-white/30">
                            Reporter information identifies who submitted the inspection images and
                            does not determine who caused the damage.
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div className="md:text-right">
                      <p className="text-xs capitalize text-white/45">
                        {humanize(item.vehicle_area)}
                      </p>
                      <p className="mt-1 text-xs text-white/30">
                        {confidenceLabel(item.confidence)}
                        {item.confidence == null ? '' : ` · ${Math.round(item.confidence * 100)}%`}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 md:justify-end">
                        {resolveItemTransitRegion(item) && (
                          <button
                            onClick={() => focusFindingOnMap(item)}
                            className="focus-ring rounded-lg text-xs text-sky-300 hover:text-sky-200"
                          >
                            Show on map
                          </button>
                        )}
                        {item.image_id && (
                          <button
                            onClick={() =>
                              window.dispatchEvent(
                                new CustomEvent('van-damage:focus-image', { detail: item.image_id })
                              )
                            }
                            className="focus-ring rounded-lg text-xs text-gold-300 hover:text-gold-200"
                          >
                            View image
                          </button>
                        )}
                        <button
                          onClick={() =>
                            copyText(`${window.location.href.split('#')[0]}#finding-${item.id}`)
                          }
                          className="focus-ring inline-flex items-center rounded-lg text-xs text-white/35 hover:text-white"
                        >
                          <Link2 className="mr-1 h-3 w-3" />
                          Copy link
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!filteredItems.length && (
                  <p className="p-8 text-center text-sm text-white/35">
                    No findings match the current filters.
                  </p>
                )}
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-white/35">
                No damage was detected in this inspection.
              </p>
            )}
          </section>

          <RepairEstimate
            severity={severityKey}
            recommendation={recommendation}
            safetyConcern={safetyConcern}
          />
          <ProcessingTimeline
            inspection={inspection}
            job={props.job}
            aiRun={aiRun}
            timeZone={props.timeZone}
          />
          <CommentsPanel {...props} />
          <VehicleHealth
            vehicle={vehicle}
            related={related}
            currentDamage={inspection.damage_count}
          />
          <RelatedInspections
            businessId={props.businessId}
            related={related}
            timeZone={props.timeZone}
          />
          {props.canViewMetadata && props.ownerMetadata && <InspectionMetadata {...props} />}
        </main>

        <aside className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          <ActivityFeed
            inspection={inspection}
            job={props.job}
            aiRun={aiRun}
            images={images}
            timeZone={props.timeZone}
          />
          <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-sky-300" />
              <h2 className="text-sm font-semibold text-white">Confidence guide</h2>
            </div>
            <div className="mt-4 space-y-3">
              <ConfidenceGuide label="High confidence" range="80–100%" color="bg-emerald-400" />
              <ConfidenceGuide label="Medium confidence" range="55–79%" color="bg-amber-400" />
              <ConfidenceGuide label="Low confidence" range="0–54%" color="bg-red-400" />
            </div>
            <p className="mt-4 text-xs leading-5 text-white/35">
              Confidence estimates how consistently the model could identify and classify visible
              conditions. It does not replace a qualified safety inspection.
            </p>
          </section>
          <section className="no-print rounded-2xl border border-white/10 bg-graphite-800 p-5">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-white/45" />
              <h2 className="text-sm font-semibold text-white">Shortcuts</h2>
            </div>
            <div className="mt-4 space-y-2 text-xs text-white/40">
              <p>
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-white/60">/</kbd> Search
                findings
              </p>
              <p>
                <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-white/60">P</kbd> Print
                report
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function ArrowUpDownIcon() {
  return <Filter className="mr-2 h-3.5 w-3.5 rotate-90 text-white/30" />
}

function WorkflowActions(props: InspectionExperienceProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmation, setConfirmation] = useState<{
    action: string
    title: string
    body: string
    danger?: boolean
  } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  if (!props.canManage) return null
  const phase = asRecord(props.inspection.metadata.phase3c)
  const archived = phase.lifecycle === 'archived'
  const actions: Array<{
    action: 'approve' | 'reject' | 'manual_review' | 'mark_repaired' | 'archive' | 'restore'
    label: string
    icon: typeof Check
    title: string
    body: string
    danger?: boolean
  }> = [
    {
      action: 'approve',
      label: 'Approve',
      icon: Check,
      title: 'Approve this inspection?',
      body: 'This records the AI inspection as reviewed and approved.',
    },
    {
      action: 'reject',
      label: 'Reject',
      icon: ThumbsDown,
      title: 'Reject this inspection?',
      body: 'This dismisses the AI result and records the decision in the audit trail.',
      danger: true,
    },
    {
      action: 'manual_review',
      label: 'Needs manual review',
      icon: UserRound,
      title: 'Request manual review?',
      body: 'The inspection will return to the review queue.',
    },
    {
      action: 'mark_repaired',
      label: 'Mark repaired',
      icon: PackageCheck,
      title: 'Mark damage repaired?',
      body: 'This records the repair milestone and closes the review.',
    },
    archived
      ? {
          action: 'restore',
          label: 'Restore',
          icon: RefreshCw,
          title: 'Restore this inspection?',
          body: 'This returns the inspection to the active review history.',
        }
      : {
          action: 'archive',
          label: 'Archive',
          icon: Archive,
          title: 'Archive this inspection?',
          body: 'The inspection remains available in fleet history.',
          danger: true,
        },
  ] as const
  async function runAction() {
    if (!confirmation) return
    setMessage(null)
    const response = await fetch(
      `/api/van-damage/inspections/${props.inspection.id}?businessId=${encodeURIComponent(props.businessId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'action', action: confirmation.action }),
      }
    )
    const result = (await response.json()) as { error?: string }
    if (!response.ok) {
      setMessage(result.error || 'Unable to update inspection.')
      setConfirmation(null)
      return
    }
    setMessage(`${confirmation.title.replace('?', '')} recorded.`)
    setConfirmation(null)
    startTransition(() => router.refresh())
  }
  return (
    <section
      aria-label="Inspection workflow"
      className="rounded-2xl border border-white/10 bg-graphite-800 px-4 py-3"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-medium text-white/70">Review workflow</p>
          <p className="mt-0.5 text-[11px] text-white/35">
            {message || 'Actions are recorded in the inspection audit trail.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map(({ icon: Icon, ...action }) => (
            <button
              key={action.action}
              disabled={pending}
              onClick={() => setConfirmation(action)}
              className={`focus-ring inline-flex items-center rounded-xl border px-3 py-2 text-xs transition disabled:opacity-50 ${action.danger ? 'border-red-400/15 text-red-200/70 hover:bg-red-400/10' : action.action === 'approve' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15' : 'border-white/10 text-white/60 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon className="mr-1.5 h-3.5 w-3.5" />
              {action.label}
            </button>
          ))}
        </div>
      </div>
      {confirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="workflow-dialog-title"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-graphite-800 p-6 shadow-panel-lg">
            <div className="flex items-start justify-between">
              <div>
                <h2 id="workflow-dialog-title" className="font-semibold text-white">
                  {confirmation.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/50">{confirmation.body}</p>
              </div>
              <button
                autoFocus
                onClick={() => setConfirmation(null)}
                aria-label="Cancel"
                className="focus-ring rounded-lg p-1 text-white/40 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setConfirmation(null)}
                className="focus-ring rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                disabled={pending}
                onClick={runAction}
                className={`focus-ring rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 ${confirmation.danger ? 'bg-red-500 text-white' : 'bg-white text-graphite-950'}`}
              >
                {pending ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ConfidenceRing({ value }: { value: number | null }) {
  const percent = value == null ? 0 : Math.round(value * 100)
  const color = percent >= 80 ? '#34d399' : percent >= 55 ? '#fbbf24' : '#f87171'
  return (
    <div className="relative h-16 w-16 shrink-0" title={`${percent}% AI confidence`}>
      <svg viewBox="0 0 64 64" className="-rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r="27"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - percent}
          className="transition-all duration-1000"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">
        {value == null ? '—' : `${percent}%`}
      </span>
    </div>
  )
}
function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-white/35">{label}</dt>
      <dd className={`truncate text-right capitalize text-white/65 ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/30">{label}</p>
      <p className="mt-1 truncate text-xs font-medium text-white/70">{value}</p>
    </div>
  )
}
function VerdictState({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'good' | 'warn' | 'bad'
}) {
  const styles =
    tone === 'good'
      ? 'text-emerald-300 bg-emerald-400/8'
      : tone === 'warn'
        ? 'text-amber-300 bg-amber-400/8'
        : 'text-red-300 bg-red-400/8'
  return (
    <div className={`rounded-xl p-2.5 ${styles}`}>
      <p className="text-[9px] uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 text-[11px] font-medium leading-4">{value}</p>
    </div>
  )
}
function SummaryMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[.025] p-4">
      <Icon className="h-4 w-4 text-gold-300/75" />
      <p className="mt-3 text-[10px] uppercase tracking-wider text-white/30">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-medium capitalize text-white/70">{value}</p>
    </div>
  )
}
function ConfidenceGuide({ label, range, color }: { label: string; range: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center text-white/55">
        <span className={`mr-2 h-2 w-2 rounded-full ${color}`} />
        {label}
      </span>
      <span className="text-white/30">{range}</span>
    </div>
  )
}
function repairPriority(severity: keyof typeof severityPresentation) {
  return severity === 'critical'
    ? 'Immediate'
    : severity === 'major'
      ? 'High · before next rental'
      : severity === 'moderate'
        ? 'Schedule promptly'
        : 'Monitor / routine'
}
function SeverityPanel({
  items,
  active,
}: {
  items: DamageItem[]
  active: keyof typeof severityPresentation
}) {
  const cards = [
    { key: 'minor', label: 'Minor', description: 'Cosmetic or removable', levels: ['low'] },
    {
      key: 'moderate',
      label: 'Moderate',
      description: 'Surface repair advised',
      levels: ['medium'],
    },
    { key: 'major', label: 'Major', description: 'Repair before service', levels: ['high'] },
    {
      key: 'critical',
      label: 'Critical',
      description: 'Potential safety impact',
      levels: ['critical'],
    },
  ]
  return (
    <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5 md:p-6">
      <h2 className="font-semibold text-white">Severity profile</h2>
      <p className="mt-1 text-xs text-white/35">
        Highest observed class: <span className="capitalize text-white/60">{active}</span>
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {cards.map((card, index) => {
          const count = items.filter((item) => card.levels.includes(item.severity ?? '')).length
          const selected = card.key === active
          return (
            <div
              key={card.key}
              className={`relative overflow-hidden rounded-xl border p-3 transition ${selected ? severityPresentation[card.key as keyof typeof severityPresentation].classes : 'border-white/8 bg-white/[.02] text-white/40'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{card.label}</span>
                <span className="text-xs">{count}</span>
              </div>
              <p className="mt-2 text-[10px] opacity-55">{card.description}</p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/20">
                <div
                  className="h-full rounded-full bg-current transition-all duration-1000"
                  style={{
                    width: selected ? `${Math.max(30, (index + 1) * 25)}%` : count ? '25%' : '0%',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RepairEstimate({
  severity,
  recommendation,
  safetyConcern,
}: {
  severity: keyof typeof severityPresentation
  recommendation: string
  safetyConcern: boolean
}) {
  const values =
    severity === 'critical'
      ? [
          'Specialist / safety repair',
          'Immediate',
          'Several days',
          'Remove from service and inspect',
        ]
      : severity === 'major'
        ? ['Body repair', 'High', '1–3 days', 'Inspect before next rental']
        : severity === 'moderate'
          ? [
              'Light body / surface repair',
              'Medium',
              'Several hours–1 day',
              'Schedule repair promptly',
            ]
          : ['Cleaning / cosmetic', 'Low', 'Minimal', 'Monitor during routine checks']
  return (
    <section className="rounded-2xl border border-gold-400/15 bg-[linear-gradient(135deg,rgba(201,168,76,.08),rgba(20,20,22,1)_45%)] p-5 md:p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-gold-300" />
            <h2 className="font-semibold text-white">Estimated repair plan</h2>
          </div>
          <p className="mt-1 text-xs text-white/35">
            AI-generated operational estimate · not a repair quote
          </p>
        </div>
        <span className="rounded-full border border-gold-400/20 bg-gold-400/10 px-2.5 py-1 text-[10px] text-gold-200">
          AI estimate
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {['Complexity', 'Priority', 'Downtime', 'Next action'].map((label, index) => (
          <div key={label} className="rounded-xl border border-white/8 bg-black/10 p-4">
            <p className="text-[10px] uppercase tracking-wider text-white/30">{label}</p>
            <p className="mt-2 text-sm font-medium text-white/70">{values[index]}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-white/45">
        {recommendation}
        {safetyConcern ? ' A qualified technician should confirm any possible safety concern.' : ''}
      </p>
    </section>
  )
}

function ProcessingTimeline({
  inspection,
  job,
  aiRun,
  timeZone,
}: {
  inspection: Inspection
  job: Job
  aiRun: AiRun
  timeZone: string
}) {
  const steps = [
    { label: 'Slack message received', time: inspection.created_at, icon: MessageSquare },
    { label: 'Inspection created', time: inspection.created_at, icon: FileCheck2 },
    { label: 'Images downloaded', time: job?.started_at, icon: DownloadCloud },
    { label: 'AI analysis started', time: aiRun?.created_at, icon: Bot },
    {
      label: 'Analysis completed',
      time: aiRun?.completed_at || inspection.completed_at,
      icon: CheckCircle2,
    },
    {
      label: inspection.review_status === 'reviewed' ? 'Inspection approved' : 'Review pending',
      time: inspection.reviewed_at as string | undefined,
      icon: UserRound,
    },
    {
      label: inspection.van_id ? 'Vehicle updated' : 'Vehicle match pending',
      time: inspection.completed_at,
      icon: CarFront,
    },
  ]
  return (
    <section
      id="inspection-timeline"
      className="scroll-mt-20 rounded-2xl border border-white/10 bg-graphite-800 p-5 md:p-6"
    >
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-violet-300" />
        <h2 className="font-semibold text-white">Inspection timeline</h2>
      </div>
      <ol className="mt-6 grid gap-0 md:grid-cols-7">
        {steps.map(({ label, time, icon: Icon }, index) => (
          <li
            key={label}
            className="relative flex gap-3 pb-5 last:pb-0 md:block md:pb-0 md:text-center"
          >
            {index < steps.length - 1 && (
              <span
                className={`absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px md:left-1/2 md:top-[15px] md:h-px md:w-full ${time ? 'bg-gradient-to-b from-gold-400/70 to-gold-400/15 md:bg-gradient-to-r' : 'bg-white/8'}`}
              />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border md:mx-auto ${time ? 'border-gold-400/30 bg-gold-400/15 text-gold-200' : 'border-white/10 bg-graphite-700 text-white/25'}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="pt-0.5 md:mt-3">
              <p className="text-[11px] font-medium leading-4 text-white/65">{label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 md:justify-center">
                <p className="text-[9px] leading-4 text-white/30">
                  {time ? formatDateInZone(time, timeZone) : 'Waiting'}
                </p>
                {index <= 1 && (
                  <InspectionPeriodBadge timestamp={inspection.created_at} timeZone={timeZone} />
                )}
              </div>
              {index === 3 && (
                <p className="text-[9px] text-violet-300/60">
                  {formatDuration(aiRun?.created_at, aiRun?.completed_at)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function CommentsPanel(props: InspectionExperienceProps) {
  const router = useRouter()
  const draftKey = `vanDamageNoteDraft:${props.inspection.id}`
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const phase = asRecord(props.inspection.metadata.phase3c)
  const userComments = asRecordArray(phase.comments)
  const comments = [
    {
      id: `system-${props.inspection.id}`,
      body: 'Inspection created from Slack image intake.',
      kind: 'system',
      authorName: 'System',
      createdAt: props.inspection.created_at,
      parentId: null,
      attachments: [] as RecordValue[],
    },
    ...(props.inspection.ai_summary
      ? [
          {
            id: `ai-${props.inspection.id}`,
            body: props.inspection.ai_summary,
            kind: 'ai',
            authorName: 'AI Analysis',
            createdAt:
              props.aiRun?.completed_at ||
              props.inspection.completed_at ||
              props.inspection.created_at,
            parentId: null,
            attachments: [] as RecordValue[],
          },
        ]
      : []),
    ...userComments.map((comment) => ({
      id: String(comment.id),
      body: asText(comment.body),
      kind: asText(comment.kind, 'internal'),
      authorName: asText(comment.authorName, 'Team member'),
      createdAt: asText(comment.createdAt, props.inspection.updated_at),
      parentId: typeof comment.parentId === 'string' ? comment.parentId : null,
      attachments: asRecordArray(comment.attachments),
    })),
  ]
  const roots = comments.filter((comment) => !comment.parentId)

  useEffect(() => {
    setBody(localStorage.getItem(draftKey) || '')
  }, [draftKey])

  useEffect(() => {
    if (body.trim()) localStorage.setItem(draftKey, body)
    else localStorage.removeItem(draftKey)
  }, [body, draftKey])

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!body.trim()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [body])

  async function submit() {
    if (!body.trim()) return
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.set('body', body)
    if (replyTo) form.set('parentId', replyTo)
    attachments.forEach((file) => form.append('attachments', file))
    const response = await fetch(
      `/api/van-damage/inspections/${props.inspection.id}?businessId=${encodeURIComponent(props.businessId)}`,
      { method: 'POST', body: form }
    )
    const result = (await response.json()) as { error?: string }
    setBusy(false)
    if (!response.ok) return setError(result.error || 'Unable to add note.')
    localStorage.removeItem(draftKey)
    setBody('')
    setReplyTo(null)
    setAttachments([])
    router.refresh()
  }
  return (
    <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Inspection notes</h2>
          <p className="mt-1 text-xs text-white/35">Internal, AI, and system conversation</p>
        </div>
        <MessageSquare className="h-4 w-4 text-fuchsia-300" />
      </div>
      <div className="mt-5 space-y-4">
        {roots.map((comment) => (
          <div key={comment.id} className="rounded-xl border border-white/8 bg-white/[.02] p-4">
            <CommentHeader comment={comment} timeZone={props.timeZone} />
            <p className="mt-3 text-sm leading-6 text-white/60">{comment.body}</p>
            <CommentAttachments
              attachments={comment.attachments}
              inspectionId={props.inspection.id}
              businessId={props.businessId}
            />
            {comment.kind === 'internal' && (
              <button
                onClick={() => setReplyTo(comment.id)}
                className="focus-ring mt-3 text-xs text-gold-300/70 hover:text-gold-200"
              >
                Reply
              </button>
            )}
            {comments
              .filter((reply) => reply.parentId === comment.id)
              .map((reply) => (
                <div key={reply.id} className="ml-4 mt-4 border-l border-white/10 pl-4">
                  <CommentHeader comment={reply} timeZone={props.timeZone} />
                  <p className="mt-2 text-sm text-white/55">{reply.body}</p>
                  <CommentAttachments
                    attachments={reply.attachments}
                    inspectionId={props.inspection.id}
                    businessId={props.businessId}
                  />
                </div>
              ))}
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-3">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between text-xs text-gold-200/70">
            <span>Replying to note</span>
            <button onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={4000}
          rows={3}
          placeholder="Add an internal note…"
          aria-label="Internal note"
          className="focus-ring w-full resize-none bg-transparent text-sm text-white/75 placeholder:text-white/25"
        />
        {body.trim() && (
          <p className="mb-2 text-[10px] text-gold-200/55">Draft autosaved locally</p>
        )}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="inline-flex items-center rounded-lg bg-white/5 px-2 py-1 text-[10px] text-white/50"
              >
                {file.name}
                <button
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                  className="ml-1.5 text-white/30 hover:text-white"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <label className="focus-ring inline-flex cursor-pointer items-center rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-white/45 hover:bg-white/5 hover:text-white/70">
              <Paperclip className="mr-1.5 h-3 w-3" />
              Attach
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                className="sr-only"
                onChange={(event) =>
                  setAttachments(Array.from(event.target.files ?? []).slice(0, 5))
                }
              />
            </label>
            <span className="truncate text-[10px] text-white/25">
              {body.length}/4000{error ? ` · ${error}` : ''}
            </span>
          </div>
          <button
            disabled={busy || !body.trim()}
            onClick={submit}
            className="focus-ring inline-flex shrink-0 items-center rounded-lg bg-white px-3 py-2 text-xs font-medium text-graphite-950 disabled:opacity-40"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {busy ? 'Posting…' : 'Post note'}
          </button>
        </div>
      </div>
    </section>
  )
}
function CommentHeader({
  comment,
  timeZone,
}: {
  comment: { kind: string; authorName: string; createdAt: string }
  timeZone: string
}) {
  const Icon = comment.kind === 'ai' ? Bot : comment.kind === 'system' ? Activity : UserRound
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center text-xs font-medium text-white/65">
        <span className="mr-2 rounded-lg bg-white/5 p-1.5">
          <Icon className="h-3 w-3" />
        </span>
        {comment.authorName}
        <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[9px] uppercase text-white/30">
          {comment.kind}
        </span>
      </span>
      <time className="text-[10px] text-white/25">
        {formatDateInZone(comment.createdAt, timeZone)}
      </time>
    </div>
  )
}
function CommentAttachments({
  attachments,
  inspectionId,
  businessId,
}: {
  attachments: RecordValue[]
  inspectionId: string
  businessId: string
}) {
  if (!attachments.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <a
          key={String(attachment.id)}
          href={`/api/van-damage/inspections/${inspectionId}/attachments/${String(attachment.id)}?businessId=${encodeURIComponent(businessId)}`}
          className="focus-ring inline-flex items-center rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-1.5 text-[10px] text-white/55 hover:bg-white/5 hover:text-white"
        >
          <Paperclip className="mr-1.5 h-3 w-3" />
          <span className="max-w-48 truncate">{asText(attachment.name, 'Attachment')}</span>
          {typeof attachment.size === 'number' && (
            <span className="ml-1.5 text-white/25">{(attachment.size / 1024).toFixed(0)} KB</span>
          )}
        </a>
      ))}
    </div>
  )
}

function VehicleHealth({
  vehicle,
  related,
  currentDamage,
}: {
  vehicle: Vehicle
  related: RelatedInspection[]
  currentDamage: number
}) {
  const points = [...related]
    .reverse()
    .map((item) => item.damage_count)
    .concat(currentDamage)
  const max = Math.max(1, ...points)
  const path =
    points.length > 1
      ? points
          .map(
            (value, index) =>
              `${index ? 'L' : 'M'} ${10 + index * (280 / (points.length - 1))} ${85 - (value / max) * 65}`
          )
          .join(' ')
      : 'M 10 85 L 290 85'
  const repairs = asRecordArray(asRecord(vehicle?.metadata.vanDamage).repairs).length
  return (
    <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Vehicle health</h2>
          <p className="mt-1 text-xs text-white/35">Condition trend across inspection history</p>
        </div>
        <Gauge className="h-5 w-5 text-emerald-300" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_220px]">
        <div className="rounded-xl border border-white/8 bg-black/10 p-3">
          <svg viewBox="0 0 300 100" className="h-32 w-full" aria-label="Damage finding trend">
            <defs>
              <linearGradient id="damageTrend" x1="0" y1="0" x2="1" y2="0">
                <stop stopColor="#c9a84c" stopOpacity=".4" />
                <stop offset="1" stopColor="#e8c34a" />
              </linearGradient>
            </defs>
            <path d="M10 85 H290" stroke="rgba(255,255,255,.08)" />
            <path
              d={path}
              fill="none"
              stroke="url(#damageTrend)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-center text-[10px] uppercase tracking-wider text-white/25">
            Damage findings over time
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MiniHealth label="Inspections" value={String(related.length + 1)} />
          <MiniHealth
            label="Open"
            value={String(
              related.filter((item) => item.status === 'needs_review').length +
                (currentDamage > 0 ? 1 : 0)
            )}
          />
          <MiniHealth label="Repairs" value={String(repairs)} />
          <MiniHealth
            label="Availability"
            value={vehicle?.status === 'active' ? 'Available' : humanize(vehicle?.status)}
          />
        </div>
      </div>
    </section>
  )
}
function MiniHealth({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[.02] p-3">
      <p className="text-lg font-semibold capitalize text-white">{value}</p>
      <p className="mt-1 text-[10px] text-white/30">{label}</p>
    </div>
  )
}

function RelatedInspections({
  businessId,
  related,
  timeZone,
}: {
  businessId: string
  related: RelatedInspection[]
  timeZone: string
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Related inspections</h2>
          <p className="mt-1 text-xs text-white/35">Previous inspections for this vehicle</p>
        </div>
        <History className="h-4 w-4 text-white/35" />
      </div>
      {related.length ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((item) => (
            <Link
              key={item.id}
              href={`/dashboard/damage-ai/inspections/${item.id}?businessId=${encodeURIComponent(businessId)}`}
              className="focus-ring rounded-xl border border-white/8 bg-white/[.02] p-4 transition hover:border-white/15 hover:bg-white/[.04]"
            >
              <div className="flex items-center justify-between gap-2">
                <CalendarDays className="h-4 w-4 text-white/35" />
                <div className="flex flex-wrap justify-end gap-1.5">
                  <InspectionPeriodBadge timestamp={item.created_at} timeZone={timeZone} />
                  <StatusBadge status={item.status} />
                </div>
              </div>
              <p className="mt-4 text-sm font-medium text-white/70">
                {formatDateInZone(item.created_at, timeZone)}
              </p>
              <p className="mt-1 text-xs text-white/35">
                {item.damage_count} damage finding{item.damage_count === 1 ? '' : 's'} ·{' '}
                {item.ai_confidence == null
                  ? '—'
                  : `${Math.round(item.ai_confidence * 100)}% confidence`}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/30">
          No previous inspections for this vehicle.
        </p>
      )}
    </section>
  )
}

function ActivityFeed({
  inspection,
  job,
  aiRun,
  images,
  timeZone,
}: {
  inspection: Inspection
  job: Job
  aiRun: AiRun
  images: DamageImage[]
  timeZone: string
}) {
  const phase = asRecord(inspection.metadata.phase3c)
  const custom = asRecordArray(phase.auditTrail).map((event) => ({
    label: asText(event.label, 'Inspection updated'),
    time: asText(event.createdAt, inspection.updated_at),
    icon: RefreshCw,
  }))
  const events = [
    ...custom,
    ...(inspection.reviewed_at
      ? [
          {
            label: `Review status changed to ${humanize(inspection.review_status)}`,
            time: inspection.reviewed_at,
            icon: FileCheck2,
          },
        ]
      : []),
    ...(inspection.van_id
      ? [
          {
            label: 'Vehicle record updated',
            time: inspection.completed_at || inspection.updated_at,
            icon: CarFront,
          },
        ]
      : []),
    ...(aiRun?.completed_at
      ? [{ label: 'AI analysis completed', time: aiRun.completed_at, icon: Bot }]
      : []),
    ...images.map((image) => ({
      label: 'Image uploaded',
      time: image.updated_at || image.created_at,
      icon: ImageIcon,
    })),
    ...(job?.started_at
      ? [{ label: 'Processing started', time: job.started_at, icon: Clock3 }]
      : []),
    { label: 'Inspection created', time: inspection.created_at, icon: FileCheck2 },
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  return (
    <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Activity</h2>
        <Activity className="h-4 w-4 text-violet-300" />
      </div>
      <div className="mt-5 max-h-[520px] space-y-0 overflow-y-auto pr-1">
        {events.slice(0, 30).map(({ label, time, icon: Icon }, index) => (
          <div key={`${label}-${time}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
            {index < events.length - 1 && (
              <span className="absolute left-[13px] top-7 h-[calc(100%-8px)] w-px bg-gradient-to-b from-white/15 to-white/[.03]" />
            )}
            <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-graphite-700 text-white/45">
              <Icon className="h-3 w-3" />
            </span>
            <div>
              <p className="text-xs leading-5 text-white/60">{label}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <time className="text-[10px] text-white/25">
                  {formatDateInZone(time, timeZone)}
                </time>
                {label === 'Inspection created' && (
                  <InspectionPeriodBadge timestamp={inspection.created_at} timeZone={timeZone} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function InspectionMetadata(props: InspectionExperienceProps) {
  const [open, setOpen] = useState(false)
  const metadata = props.ownerMetadata
  if (!metadata) return null
  const groups = [
    {
      title: 'Source',
      rows: [
        ['Slack workspace', metadata.source.workspace || 'Not available'],
        [
          'Slack channel',
          metadata.source.channel ? `#${metadata.source.channel}` : 'Not available',
        ],
        ['Source message', metadata.source.messageTimestamp || 'Not available'],
        ['Upload session', metadata.source.uploadSessionId || 'Not available'],
      ],
    },
    {
      title: 'Processing',
      rows: [
        [
          'Inspection created',
          formatDateInZone(metadata.processing.inspectionCreatedAt, props.timeZone),
        ],
        [
          'Analysis started',
          formatDateInZone(metadata.processing.analysisStartedAt, props.timeZone),
        ],
        [
          'Analysis completed',
          formatDateInZone(metadata.processing.analysisCompletedAt, props.timeZone),
        ],
        ['Retry count', String(metadata.processing.retryCount)],
        ['Worker status', humanize(metadata.processing.workerStatus)],
        ['Worker version', metadata.processing.workerVersion || 'Not reported'],
      ],
    },
    {
      title: 'Storage',
      rows: [
        ['Image count', String(metadata.storage.imageCount)],
        ['Storage', metadata.storage.provider],
        ['Cache state', metadata.storage.cache],
      ],
    },
    {
      title: 'Database',
      rows: [
        ['Inspection ID', metadata.database.inspectionId],
        ['Van ID', metadata.database.vehicleId || 'Not linked'],
        ['Damage cases', String(metadata.database.damageCaseIds.length)],
        ['Created', formatDateInZone(metadata.database.createdAt, props.timeZone)],
        ['Updated', formatDateInZone(metadata.database.updatedAt, props.timeZone)],
        ['Vehicle resolution', humanize(metadata.vehicleResolution.source)],
      ],
    },
  ]
  return (
    <section
      id="inspection-metadata"
      className="no-print scroll-mt-20 overflow-hidden rounded-2xl border border-white/10 bg-graphite-800"
    >
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between px-5 py-4 text-left md:px-6"
      >
        <span>
          <span className="font-semibold text-white">Inspection Metadata</span>
          <span className="ml-2 text-xs text-white/30">Technical details</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-white/40 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid gap-px border-t border-white/8 bg-white/5 lg:grid-cols-2">
          {groups.map((group) => (
            <section key={group.title} className="bg-graphite-800 p-5">
              <h3 className="text-[10px] font-semibold uppercase tracking-[.16em] text-gold-300/65">
                {group.title}
              </h3>
              <dl className="mt-3 space-y-3">
                {group.rows.map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 text-xs">
                    <dt className="text-white/35">{label}</dt>
                    <dd className="max-w-[65%] break-all text-right font-mono text-white/60">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
