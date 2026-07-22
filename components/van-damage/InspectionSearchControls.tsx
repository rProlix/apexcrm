'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Filter, Search, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { InspectionSearchFilters, InspectionSort } from '@/lib/van-damage/inspection-search'

type Option = { value: string; label: string }

const sortOptions: Array<{ value: InspectionSort; label: string }> = [
  { value: 'newest_damage', label: 'Newest Damage First' },
  { value: 'oldest_damage', label: 'Oldest Damage First' },
  { value: 'latest_upload', label: 'Latest Upload' },
  { value: 'oldest_upload', label: 'Oldest Upload' },
  { value: 'newest_inspection', label: 'Newest Inspection' },
  { value: 'oldest_inspection', label: 'Oldest Inspection' },
  { value: 'highest_severity', label: 'Highest Severity' },
  { value: 'lowest_severity', label: 'Lowest Severity' },
  { value: 'most_images', label: 'Most Images' },
  { value: 'fewest_images', label: 'Fewest Images' },
  { value: 'most_active_damage', label: 'Most Active Damage' },
  { value: 'recently_updated', label: 'Recently Updated' },
  { value: 'recently_reviewed', label: 'Recently Reviewed' },
  { value: 'needs_review', label: 'Needs Review First' },
  { value: 'repair_scheduled', label: 'Repair Scheduled First' },
  { value: 'in_repair', label: 'In Repair First' },
  { value: 'repaired', label: 'Repaired First' },
  { value: 'driver_name', label: 'Driver Name' },
  { value: 'van_number', label: 'Van Number' },
  { value: 'inspection_number', label: 'Inspection Number' },
]

export function InspectionSearchControls({
  filters,
  drivers,
  vans,
  statuses,
  severities,
  damageTypes,
  regions,
  repairStatuses,
}: {
  filters: InspectionSearchFilters
  drivers: Option[]
  vans: Option[]
  statuses: string[]
  severities: string[]
  damageTypes: string[]
  regions: string[]
  repairStatuses: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(filters.q)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [, startTransition] = useTransition()
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    Object.entries(changes).forEach(([key, value]) => {
      if (!value || value === 'all' || value === 'false') next.delete(key)
      else next.set(key, value)
    })
    next.delete('page')
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  useEffect(() => setSearch(filters.q), [filters.q])
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current) }, [])

  const onSearch = (value: string) => {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => update({ q: value.trim() || null }), 320)
  }

  const activeCount = [filters.driver, filters.van, filters.status, filters.severity, filters.damageType, filters.region, filters.period, filters.damageState, filters.review, filters.images, filters.repairStatus]
    .filter((value) => value !== 'all').length + Number(filters.today)

  const quick = [
    { label: 'Latest Damage', active: filters.sort === 'newest_damage', changes: { sort: 'newest_damage' } },
    { label: 'Latest Upload', active: filters.sort === 'latest_upload', changes: { sort: 'latest_upload' } },
    { label: "Today's Inspections", active: filters.today, changes: { today: filters.today ? null : '1' } },
    { label: 'Needs Review', active: filters.review === 'needs_review', changes: { review: filters.review === 'needs_review' ? null : 'needs_review' } },
    { label: 'Severe Damage', active: filters.severity === 'severe', changes: { severity: filters.severity === 'severe' ? null : 'severe' } },
    { label: 'Active Damage', active: filters.sort === 'most_active_damage', changes: { sort: 'most_active_damage' } },
    { label: 'Recently Updated', active: filters.sort === 'recently_updated', changes: { sort: 'recently_updated' } },
  ] as const

  const filterFields = <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Select label="Driver" value={filters.driver} options={drivers} onChange={(value) => update({ driver: value })} />
    <Select label="Van" value={filters.van} options={vans} onChange={(value) => update({ van: value })} />
    <Select label="Inspection status" value={filters.status} options={textOptions(statuses)} onChange={(value) => update({ status: value })} />
    <Select label="Severity" value={filters.severity} options={[{ value: 'severe', label: 'Severe (High or Critical)' }, ...textOptions(severities)]} onChange={(value) => update({ severity: value })} />
    <Select label="Damage type" value={filters.damageType} options={textOptions(damageTypes)} onChange={(value) => update({ damageType: value })} />
    <Select label="Vehicle region" value={filters.region} options={textOptions(regions)} onChange={(value) => update({ region: value })} />
    <Select label="Inspection period" value={filters.period} options={[{ value: 'SOD', label: 'Start of Day (SOD)' }, { value: 'EOD', label: 'End of Day (EOD)' }]} onChange={(value) => update({ period: value })} />
    <Select label="Damage history" value={filters.damageState} options={[{ value: 'new_damage', label: 'New Damage' }, { value: 'existing_damage', label: 'Existing Damage' }, { value: 'recurring_damage', label: 'Recurring Damage' }, { value: 'duplicate_observations', label: 'Duplicate Observations' }]} onChange={(value) => update({ damageState: value })} />
    <Select label="Review" value={filters.review} options={[{ value: 'needs_review', label: 'Needs Review' }, { value: 'ai_reviewed', label: 'AI Reviewed' }, { value: 'human_reviewed', label: 'Human Reviewed' }]} onChange={(value) => update({ review: value })} />
    <Select label="Images" value={filters.images} options={[{ value: 'has_images', label: 'Has Images' }, { value: 'no_images', label: 'No Images' }]} onChange={(value) => update({ images: value })} />
    <Select label="Repair status" value={filters.repairStatus} options={textOptions(repairStatuses)} onChange={(value) => update({ repairStatus: value })} />
    <label className="block text-xs text-white/45"><span className="mb-1.5 block">Sort results</span><select value={filters.sort} onChange={(event) => update({ sort: event.target.value })} className="focus-ring min-h-11 w-full rounded-xl border border-white/10 bg-graphite-900 px-3 text-sm text-white/70">{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  </div>

  return <div className="space-y-3">
    <div className="sticky top-0 z-30 rounded-2xl border border-white/10 bg-graphite-900/95 p-3 shadow-xl backdrop-blur-xl">
      <div className="flex gap-2">
        <label className="focus-within:focus-ring flex min-h-11 flex-1 items-center rounded-xl border border-white/10 bg-black/20 px-3"><Search className="mr-2 h-4 w-4 shrink-0 text-white/30" /><span className="sr-only">Search inspections</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search van, inspection, driver, damage, region, notes, or AI summary" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25" /></label>
        <button type="button" onClick={() => setDrawerOpen(true)} aria-label={`Open filters${activeCount ? `, ${activeCount} active` : ''}`} className="focus-ring relative min-h-11 rounded-xl border border-white/10 px-3 text-white/60 lg:hidden"><Filter className="h-4 w-4" />{activeCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-gold-400 px-1.5 text-[9px] font-bold text-black">{activeCount}</span>}</button>
      </div>
    </div>
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Quick inspection filters">
      {quick.map((item) => <button type="button" key={item.label} aria-pressed={item.active} onClick={() => update(item.changes)} className={`focus-ring shrink-0 rounded-full border px-3 py-1.5 text-xs ${item.active ? 'border-gold-400/35 bg-gold-400/15 text-gold-100' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>{item.label}</button>)}
      <button type="button" disabled title="Available when dashboard user-to-Slack identity mapping is enabled" className="shrink-0 cursor-not-allowed rounded-full border border-white/5 px-3 py-1.5 text-xs text-white/20">My Uploads · soon</button>
    </div>
    <div className="hidden rounded-2xl border border-white/8 bg-white/[.02] p-4 lg:block">{filterFields}</div>
    {drawerOpen && <div className="fixed inset-0 z-[100] lg:hidden"><button type="button" aria-label="Close filters" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-black/70" /><section role="dialog" aria-modal="true" aria-labelledby="inspection-filter-title" className="absolute inset-y-0 right-0 w-[min(92vw,28rem)] overflow-y-auto border-l border-white/10 bg-graphite-950 p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 id="inspection-filter-title" className="font-semibold text-white">Inspection filters</h2><button type="button" autoFocus onClick={() => setDrawerOpen(false)} aria-label="Close filters" className="focus-ring rounded-lg p-2 text-white/55"><X className="h-5 w-5" /></button></div>{filterFields}<button type="button" onClick={() => setDrawerOpen(false)} className="focus-ring mt-6 min-h-11 w-full rounded-xl bg-white text-sm font-medium text-graphite-950">Show results</button></section></div>}
  </div>
}

function textOptions(values: string[]): Option[] {
  return values.map((value) => ({ value, label: value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }))
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return <label className="block text-xs text-white/45"><span className="mb-1.5 block">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="focus-ring min-h-11 w-full rounded-xl border border-white/10 bg-graphite-900 px-3 text-sm text-white/70"><option value="all">All</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
}
