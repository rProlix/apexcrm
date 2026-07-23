'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react'
import type { MaintenanceHistoryEvent, MaintenanceItem } from '@/lib/maintenance/types'
import { maintenanceResponsibilityDisclaimer } from '@/lib/maintenance/types'
import { compareMaintenancePriority } from '@/lib/maintenance/triage'
import { createClient } from '@/lib/supabase/browser'

type Vehicle = { id: string; name: string; van_number: string | null; status: string }
type User = { id: string; full_name: string | null; email: string }
type Sort = 'priority' | 'newest' | 'oldest' | 'activity' | 'van'
const closed = new Set(['completed', 'cancelled'])

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function reporterName(item: MaintenanceItem) {
  const snapshot = item.reporter_snapshot
  return String(
    snapshot.displayName ??
      snapshot.realName ??
      snapshot.username ??
      item.slack_reporter_id ??
      'Unknown reporter'
  )
}

function time(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )
}

function priorityTone(priority: string) {
  if (priority === 'urgent') return 'border-red-400/30 bg-red-400/10 text-red-200'
  if (priority === 'high') return 'border-amber-400/25 bg-amber-400/10 text-amber-100'
  if (priority === 'low') return 'border-sky-400/20 bg-sky-400/10 text-sky-200'
  return 'border-white/10 bg-white/[.04] text-white/65'
}

export function MaintenanceWorkspace({
  businessId,
  canManage,
  initialItems,
  vehicles,
  users,
}: {
  businessId: string
  canManage: boolean
  initialItems: MaintenanceItem[]
  vehicles: Vehicle[]
  users: User[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const openedInitialItem = useRef(false)
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [status, setStatus] = useState(searchParams.get('status') ?? 'active')
  const [priority, setPriority] = useState(searchParams.get('priority') ?? 'all')
  const [category, setCategory] = useState(searchParams.get('category') ?? 'all')
  const [vanId, setVanId] = useState(searchParams.get('vanId') ?? 'all')
  const [sort, setSort] = useState<Sort>((searchParams.get('sort') as Sort) ?? 'priority')
  const [selected, setSelected] = useState<MaintenanceItem | null>(null)
  const [history, setHistory] = useState<MaintenanceHistoryEvent[]>([])
  const [attachments, setAttachments] = useState<
    Array<{ id: string; filename: string; content_type: string | null; status: string }>
  >([])
  const [drawerBusy, setDrawerBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const values = { q: query, status, priority, category, vanId, sort }
    for (const [key, value] of Object.entries(values)) {
      const defaultValue = key === 'status' ? 'active' : key === 'sort' ? 'priority' : 'all'
      if (!value || value === defaultValue) params.delete(key)
      else params.set(key, value)
    }
    const next = params.toString()
    const current = searchParams.toString()
    if (next !== current) router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [category, pathname, priority, query, router, searchParams, sort, status, vanId])

  useEffect(() => {
    if (openedInitialItem.current) return
    openedInitialItem.current = true
    const itemId = searchParams.get('itemId')
    const item = itemId ? initialItems.find((candidate) => candidate.id === itemId) : null
    if (item) void openItem(item)
    // The URL item is intentionally opened once; subsequent drawer state is local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => startTransition(() => router.refresh()), 250)
    }
    const channel = supabase
      .channel(`fleet-maintenance-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fleet_maintenance_items',
          filter: `tenant_id=eq.${businessId}`,
        },
        refresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fleet_maintenance_history',
          filter: `tenant_id=eq.${businessId}`,
        },
        refresh
      )
      .subscribe()
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      void supabase.removeChannel(channel)
    }
  }, [businessId, router])

  const categories = useMemo(
    () => [...new Set(initialItems.map((item) => item.category))].sort(),
    [initialItems]
  )
  const metrics = useMemo(
    () => ({
      urgent: initialItems.filter(
        (item) => !closed.has(item.status) && item.effective_priority === 'urgent'
      ).length,
      high: initialItems.filter(
        (item) => !closed.has(item.status) && item.effective_priority === 'high'
      ).length,
      review: initialItems.filter((item) => !closed.has(item.status) && item.needs_review).length,
      scheduled: initialItems.filter((item) => item.status === 'scheduled').length,
      completed: initialItems.filter((item) => item.status === 'completed').length,
    }),
    [initialItems]
  )

  const items = useMemo(() => {
    const term = query.trim().toLowerCase()
    const now = Date.now()
    return initialItems
      .filter((item) => {
        if (status === 'active' && closed.has(item.status)) return false
        if (status !== 'all' && status !== 'active' && item.status !== status) return false
        if (priority !== 'all' && item.effective_priority !== priority) return false
        if (category !== 'all' && item.category !== category) return false
        if (vanId !== 'all' && item.van_id !== vanId) return false
        if (
          term &&
          ![
            item.title,
            item.description,
            item.latest_note,
            item.van?.name,
            item.van?.van_number,
            reporterName(item),
            String(item.maintenance_number),
          ].some((value) => value?.toLowerCase().includes(term))
        )
          return false
        return true
      })
      .sort((a, b) => {
        if (sort === 'priority')
          return compareMaintenancePriority(
            {
              effectivePriority: a.effective_priority,
              severity: a.severity,
              operationalImpact: a.operational_impact,
              timeSensitivity: a.time_sensitivity,
              resolutionEffort: a.resolution_effort,
              reportedAt: a.reported_at,
              dueAt: a.due_at,
              scheduledAt: a.scheduled_at,
              latestActivityAt: a.latest_activity_at,
            },
            {
              effectivePriority: b.effective_priority,
              severity: b.severity,
              operationalImpact: b.operational_impact,
              timeSensitivity: b.time_sensitivity,
              resolutionEffort: b.resolution_effort,
              reportedAt: b.reported_at,
              dueAt: b.due_at,
              scheduledAt: b.scheduled_at,
              latestActivityAt: b.latest_activity_at,
            },
            now
          )
        if (sort === 'newest') return b.reported_at.localeCompare(a.reported_at)
        if (sort === 'oldest') return a.reported_at.localeCompare(b.reported_at)
        if (sort === 'activity') return b.latest_activity_at.localeCompare(a.latest_activity_at)
        return (a.van?.van_number ?? 'ZZZ').localeCompare(b.van?.van_number ?? 'ZZZ', undefined, {
          numeric: true,
        })
      })
  }, [category, initialItems, priority, query, sort, status, vanId])
  const metricCards: Array<{
    name: string
    value: number
    icon: typeof ShieldAlert
    tone: string
  }> = [
    {
      name: 'Urgent',
      value: metrics.urgent,
      icon: ShieldAlert,
      tone: 'text-red-200 bg-red-400/10',
    },
    {
      name: 'High priority',
      value: metrics.high,
      icon: AlertTriangle,
      tone: 'text-amber-200 bg-amber-400/10',
    },
    {
      name: 'Needs review',
      value: metrics.review,
      icon: CircleDot,
      tone: 'text-fuchsia-200 bg-fuchsia-400/10',
    },
    {
      name: 'Scheduled',
      value: metrics.scheduled,
      icon: CalendarClock,
      tone: 'text-sky-200 bg-sky-400/10',
    },
    {
      name: 'Completed',
      value: metrics.completed,
      icon: CheckCircle2,
      tone: 'text-emerald-200 bg-emerald-400/10',
    },
  ]

  async function openItem(item: MaintenanceItem) {
    setSelected(item)
    setDrawerBusy(true)
    setMessage(null)
    const response = await fetch(
      `/api/fleet/maintenance/${item.id}?businessId=${encodeURIComponent(businessId)}`
    )
    const result = (await response.json()) as {
      history?: MaintenanceHistoryEvent[]
      attachments?: typeof attachments
      error?: string
    }
    if (response.ok) {
      setHistory(result.history ?? [])
      setAttachments(result.attachments ?? [])
    } else setMessage(result.error ?? 'Unable to load item')
    setDrawerBusy(false)
  }

  async function action(actionName: string, reason?: string) {
    if (!selected) return
    setDrawerBusy(true)
    setMessage(null)
    const response = await fetch(
      `/api/fleet/maintenance/${selected.id}?businessId=${encodeURIComponent(businessId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionName, reason }),
      }
    )
    const result = (await response.json()) as { error?: string }
    if (!response.ok) setMessage(result.error ?? 'Unable to update item')
    else {
      setSelected(null)
      startTransition(() => router.refresh())
    }
    setDrawerBusy(false)
  }

  async function addNote(note: string) {
    if (!selected || !note.trim()) return
    setDrawerBusy(true)
    setMessage(null)
    const response = await fetch(`/api/fleet/maintenance/${selected.id}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId, note }),
    })
    const result = (await response.json()) as { error?: string }
    if (!response.ok) setMessage(result.error ?? 'Unable to add note')
    else await openItem(selected)
    setDrawerBusy(false)
  }

  async function addFiles(files: FileList | null) {
    if (!selected || !files?.length) return
    setDrawerBusy(true)
    setMessage(null)
    const form = new FormData()
    form.set('businessId', businessId)
    for (const file of [...files].slice(0, 5)) form.append('attachments', file)
    const response = await fetch(`/api/fleet/maintenance/${selected.id}/attachments`, {
      method: 'POST',
      body: form,
    })
    const result = (await response.json()) as { error?: string }
    if (!response.ok) setMessage(result.error ?? 'Unable to upload attachments')
    else await openItem(selected)
    setDrawerBusy(false)
  }

  return (
    <div className="space-y-6" aria-busy={pending}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {metricCards.map(({ name, value, icon: Icon, tone }) => (
          <div key={name} className="rounded-2xl border border-white/10 bg-graphite-800 p-4">
            <span className={`inline-flex rounded-lg p-2 ${tone}`}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
            <p className="text-xs text-white/40">{name}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-white/10 bg-graphite-800 p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-white/30" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search van, issue, reporter, or item number"
              className="w-full rounded-xl border border-white/10 bg-graphite-900 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/25"
            />
          </label>
          {[
            [
              status,
              setStatus,
              [
                ['active', 'Active'],
                ['all', 'All statuses'],
                ['needs_review', 'Needs review'],
                ['scheduled', 'Scheduled'],
                ['in_progress', 'In progress'],
                ['completed', 'Completed'],
                ['cancelled', 'Cancelled'],
              ],
            ],
            [
              priority,
              setPriority,
              [
                ['all', 'All priorities'],
                ['urgent', 'Urgent'],
                ['high', 'High'],
                ['normal', 'Normal'],
                ['low', 'Low'],
              ],
            ],
            [
              category,
              setCategory,
              [['all', 'All categories'], ...categories.map((value) => [value, label(value)])],
            ],
            [
              vanId,
              setVanId,
              [
                ['all', 'All vans'],
                ...vehicles.map((van) => [
                  van.id,
                  van.van_number ? `Van ${van.van_number}` : van.name,
                ]),
              ],
            ],
            [
              sort,
              (value: string) => setSort(value as Sort),
              [
                ['priority', 'Priority sort'],
                ['activity', 'Recent activity'],
                ['newest', 'Newest'],
                ['oldest', 'Oldest'],
                ['van', 'Van number'],
              ],
            ],
          ].map(([value, setter, options], index) => (
            <select
              key={index}
              value={value as string}
              onChange={(event) => (setter as (value: string) => void)(event.target.value)}
              className="rounded-xl border border-white/10 bg-graphite-900 px-3 py-2.5 text-xs text-white/65"
            >
              {(options as string[][]).map(([optionValue, optionLabel]) => (
                <option key={optionValue} value={optionValue}>
                  {optionLabel}
                </option>
              ))}
            </select>
          ))}
          <button
            onClick={() => setCreating(true)}
            className="rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-graphite-950 hover:bg-amber-200"
          >
            <Plus className="mr-1.5 inline h-4 w-4" />
            New item
          </button>
        </div>
      </section>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-white/35">
            No maintenance items match these filters.
          </div>
        ) : null}
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => openItem(item)}
            className="group grid w-full gap-4 rounded-2xl border border-white/10 bg-graphite-800 p-4 text-left transition hover:border-amber-300/25 md:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${priorityTone(item.effective_priority)}`}
                >
                  {item.effective_priority}
                </span>
                <span className="text-xs text-white/35">M-{item.maintenance_number}</span>
                <span className="text-xs text-white/35">{label(item.status)}</span>
                {item.needs_review ? (
                  <span className="text-xs text-fuchsia-200">Needs review</span>
                ) : null}
                {item.due_at && Date.parse(item.due_at) < Date.now() && !closed.has(item.status) ? (
                  <span className="text-xs text-red-200">Overdue</span>
                ) : null}
              </div>
              <h3 className="mt-2 truncate font-semibold text-white">{item.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-white/45">{item.description}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/35">
                <span>
                  {item.van?.van_number
                    ? `Van ${item.van.van_number}`
                    : (item.van?.name ?? 'Van unresolved')}
                </span>
                <span>{label(item.category)}</span>
                <span>{label(item.resolution_effort)}</span>
                <span>{reporterName(item)}</span>
                {item.attachment_count ? (
                  <span>
                    <Paperclip className="mr-1 inline h-3 w-3" />
                    {item.attachment_count}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-3 self-center text-xs text-white/35">
              <span>{time(item.latest_activity_at)}</span>
              <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          </button>
        ))}
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/65"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelected(null)
          }}
        >
          <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-graphite-900 p-5 shadow-2xl md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-white/35">Maintenance M-{selected.maintenance_number}</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{selected.title}</h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg border border-white/10 p-2 text-white/50 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {message ? (
              <p className="mt-4 rounded-lg bg-red-400/10 p-3 text-sm text-red-200">{message}</p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              {[
                [
                  'Van',
                  selected.van?.van_number
                    ? `Van ${selected.van.van_number}`
                    : (selected.van?.name ?? 'Unresolved'),
                ],
                ['Priority', label(selected.effective_priority)],
                ['Status', label(selected.status)],
                ['Severity', label(selected.severity)],
                ['Impact', label(selected.operational_impact)],
                ['Timing', label(selected.time_sensitivity)],
                ['Effort', label(selected.resolution_effort)],
                ['Scheduled', time(selected.scheduled_at)],
              ].map(([name, value]) => (
                <div key={name} className="rounded-xl border border-white/8 bg-white/[.025] p-3">
                  <p className="text-[10px] uppercase tracking-wide text-white/30">{name}</p>
                  <p className="mt-1 text-white/70">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-white/10 p-4">
              <p className="text-sm text-white/70">{selected.description}</p>
              <p className="mt-3 text-xs text-white/35">{selected.priority_reason}</p>
            </div>
            {selected.source === 'slack' ? (
              <div className="mt-4 rounded-xl border border-fuchsia-300/10 bg-fuchsia-300/[.04] p-4 text-xs text-white/50">
                <p className="text-white/70">
                  Reported by {reporterName(selected)} · {time(selected.reported_at)}
                </p>
                <p className="mt-2">{maintenanceResponsibilityDisclaimer}</p>
                {!selected.slack_source_available ? (
                  <p className="mt-2 text-amber-200">
                    The original Slack message is no longer available; preserved history remains
                    authoritative.
                  </p>
                ) : null}
              </div>
            ) : null}
            {canManage && !closed.has(selected.status) ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {selected.status === 'needs_review' ? (
                  <ActionButton onClick={() => action('approve')} label="Approve" />
                ) : null}
                {!['scheduled', 'in_progress'].includes(selected.status) ? (
                  <ActionButton onClick={() => action('schedule')} label="Schedule" />
                ) : null}
                {selected.status !== 'in_progress' ? (
                  <ActionButton onClick={() => action('start')} label="Start work" />
                ) : null}
                <ActionButton
                  onClick={() => {
                    const reason = window.prompt('Completion note (required)')
                    if (reason) void action('complete', reason)
                  }}
                  label="Complete"
                  primary
                />
                <ActionButton
                  onClick={() => {
                    const reason = window.prompt('Cancellation reason (required)')
                    if (reason) void action('cancel', reason)
                  }}
                  label="Cancel"
                />
              </div>
            ) : null}
            {canManage && closed.has(selected.status) ? (
              <div className="mt-5">
                <ActionButton
                  onClick={() => {
                    const reason = window.prompt('Reopen reason (required)')
                    if (reason) void action('reopen', reason)
                  }}
                  label="Reopen"
                />
              </div>
            ) : null}
            <form
              className="mt-7"
              onSubmit={(event) => {
                event.preventDefault()
                const form = event.currentTarget
                const note = new FormData(form).get('note')
                if (typeof note === 'string' && note.trim()) {
                  void addNote(note)
                  form.reset()
                }
              }}
            >
              <h3 className="font-medium text-white">Add note</h3>
              <div className="mt-3 flex gap-2">
                <input
                  name="note"
                  required
                  maxLength={4000}
                  placeholder="Record diagnosis, scheduling, parts, or repair progress"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-graphite-800 px-3 py-2 text-sm text-white placeholder:text-white/25"
                />
                <button
                  disabled={drawerBusy}
                  className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-graphite-950"
                >
                  Add
                </button>
              </div>
            </form>
            <div className="mt-7">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-white">Attachments</h3>
                <label className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/55 hover:bg-white/5">
                  Upload
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,text/plain,text/csv,video/mp4,video/quicktime"
                    onChange={(event) => {
                      void addFiles(event.target.files)
                      event.target.value = ''
                    }}
                  />
                </label>
              </div>
              <div className="mt-3 space-y-2">
                {attachments.length ? (
                  attachments.map((file) => (
                    <a
                      key={file.id}
                      target="_blank"
                      rel="noreferrer"
                      href={`/api/fleet/maintenance/attachments/${file.id}?businessId=${encodeURIComponent(businessId)}`}
                      className="flex items-center gap-2 rounded-lg border border-white/8 p-3 text-sm text-white/60 hover:text-white"
                    >
                      <FileText className="h-4 w-4" />
                      {file.filename}
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-white/30">No uploaded attachments.</p>
                )}
              </div>
            </div>
            <div className="mt-7">
              <h3 className="font-medium text-white">History</h3>
              {drawerBusy ? (
                <Loader2 className="mt-4 h-5 w-5 animate-spin text-white/40" />
              ) : (
                <ol className="mt-4 space-y-4 border-l border-white/10 pl-5">
                  {history.map((event) => (
                    <li key={event.id} className="relative">
                      <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-amber-300" />
                      <p className="text-sm text-white/65">{label(event.event_type)}</p>
                      {event.note ? (
                        <p className="mt-1 text-sm text-white/40">{event.note}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-white/25">
                        {time(event.occurred_at)} · {label(event.actor_type)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        </div>
      ) : null}
      {creating ? (
        <CreateMaintenanceModal
          businessId={businessId}
          vehicles={vehicles}
          users={users}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            startTransition(() => router.refresh())
          }}
        />
      ) : null}
    </div>
  )
}

function ActionButton({
  label: text,
  onClick,
  primary = false,
}: {
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={
        primary
          ? 'rounded-lg bg-emerald-300 px-3 py-2 text-sm font-medium text-graphite-950'
          : 'rounded-lg border border-white/10 px-3 py-2 text-sm text-white/65 hover:bg-white/5'
      }
    >
      {text}
    </button>
  )
}

function CreateMaintenanceModal({
  businessId,
  vehicles,
  users,
  onClose,
  onCreated,
}: {
  businessId: string
  vehicles: Vehicle[]
  users: User[]
  onClose: () => void
  onCreated: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError(null)
          const data = new FormData(event.currentTarget)
          const response = await fetch('/api/fleet/maintenance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              businessId,
              vanId: data.get('vanId') || null,
              title: data.get('title'),
              description: data.get('description'),
              assignedUserId: data.get('assignedUserId') || null,
              dueAt: data.get('dueAt') ? new Date(String(data.get('dueAt'))).toISOString() : null,
            }),
          })
          const result = (await response.json()) as { error?: string }
          if (response.ok) onCreated()
          else setError(result.error ?? 'Unable to create item')
          setBusy(false)
        }}
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-graphite-900 p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">New maintenance item</h2>
          <button type="button" onClick={onClose}>
            <X className="h-4 w-4 text-white/50" />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-xs text-white/45">
            Van
            <select
              name="vanId"
              className="mt-1 w-full rounded-lg border border-white/10 bg-graphite-800 px-3 py-2 text-sm text-white"
            >
              <option value="">Unresolved / fleet-wide</option>
              {vehicles.map((van) => (
                <option key={van.id} value={van.id}>
                  {van.van_number ? `Van ${van.van_number}` : van.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-white/45">
            Title
            <input
              required
              name="title"
              maxLength={160}
              className="mt-1 w-full rounded-lg border border-white/10 bg-graphite-800 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-white/45">
            Report
            <textarea
              required
              name="description"
              rows={5}
              maxLength={4000}
              className="mt-1 w-full rounded-lg border border-white/10 bg-graphite-800 px-3 py-2 text-sm text-white"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-white/45">
              Assign to
              <select
                name="assignedUserId"
                className="mt-1 w-full rounded-lg border border-white/10 bg-graphite-800 px-3 py-2 text-sm text-white"
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-white/45">
              Due date
              <input
                type="datetime-local"
                name="dueAt"
                className="mt-1 w-full rounded-lg border border-white/10 bg-graphite-800 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-graphite-950"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create item'}
          </button>
        </div>
      </form>
    </div>
  )
}
