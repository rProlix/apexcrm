import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, Search } from 'lucide-react'
import { syncAndLoadActionInbox, type ActionInboxQuery } from '@/lib/command-center/actions'
import { isTenantAdmin, requireCommandCenterContext } from '@/lib/command-center/context'
import { formatInTenantTime } from '@/lib/command-center/time'
import { ActionStatusControls } from '@/components/command-center/ActionStatusControls'

export const dynamic = 'force-dynamic'

export default async function ActionInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const context = await requireCommandCenterContext('view_dashboard')
  const query: ActionInboxQuery = {
    search: stringParam(params.search),
    status: stringParam(params.status),
    priority: stringParam(params.priority),
    module: stringParam(params.module),
    sourceType: stringParam(params.source),
    assignedToMe: stringParam(params.assigned) === 'me',
    overdue: stringParam(params.overdue) === 'true',
    needsReview: stringParam(params.review) === 'true',
    sort: stringParam(params.sort) as ActionInboxQuery['sort'],
  }
  let inbox: Awaited<ReturnType<typeof syncAndLoadActionInbox>>
  let inboxFailed = false
  try {
    inbox = await syncAndLoadActionInbox(query)
  } catch {
    inboxFailed = true
    inbox = {
      items: [],
      loadWarnings: ['We couldn’t load action items. Existing source records were not changed.'],
    }
  }
  const { items, loadWarnings } = inbox
  const counts = items.reduce<Record<string, number>>((result, item) => {
    result[item.priority] = (result[item.priority] ?? 0) + 1
    return result
  }, {})

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-red-300/70">
          Command center
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">Action Required</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/45">
          Only work that needs a person appears here. Items close automatically when their source
          issue is fixed.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        {(['urgent', 'high', 'normal', 'low'] as const).map((priority) => (
          <div key={priority} className="rounded-xl border border-white/8 bg-graphite-900/60 p-4">
            <p className="text-2xs uppercase tracking-widest text-white/30">{priority}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{counts[priority] ?? 0}</p>
          </div>
        ))}
      </div>

      <form className="grid gap-3 rounded-2xl border border-white/10 bg-graphite-900/60 p-4 md:grid-cols-6">
        <label className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-white/25" />
          <input
            name="search"
            defaultValue={query.search}
            placeholder="Search actions…"
            className="w-full rounded-lg border border-white/10 bg-graphite-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/25"
          />
        </label>
        <Select
          name="status"
          value={query.status}
          options={['open', 'resolved', 'snoozed', 'dismissed', 'all']}
        />
        <Select
          name="priority"
          value={query.priority}
          options={['all', 'urgent', 'high', 'normal', 'low']}
        />
        <select name="module" defaultValue={query.module ?? 'all'} className={selectClass}>
          <option value="all">All modules</option>
          {context.activeModuleKeys.map((moduleKey) => (
            <option key={moduleKey} value={moduleKey}>
              {moduleKey.replace('_', ' ')}
            </option>
          ))}
        </select>
        <input
          name="source"
          defaultValue={query.sourceType}
          placeholder="Source type"
          aria-label="Source type"
          className={selectClass}
        />
        <Select
          name="sort"
          value={query.sort}
          options={['priority', 'due', 'newest', 'oldest', 'activity']}
        />
        <label className="flex items-center gap-2 text-xs text-white/45">
          <input type="checkbox" name="assigned" value="me" defaultChecked={query.assignedToMe} />{' '}
          Assigned to me
        </label>
        <label className="flex items-center gap-2 text-xs text-white/45">
          <input type="checkbox" name="overdue" value="true" defaultChecked={query.overdue} />{' '}
          Overdue only
        </label>
        <label className="flex items-center gap-2 text-xs text-white/45">
          <input type="checkbox" name="review" value="true" defaultChecked={query.needsReview} />{' '}
          Needs review
        </label>
        <button className="rounded-lg bg-white/8 px-3 py-2 text-xs font-medium text-white/65 hover:bg-white/12">
          Apply filters
        </button>
      </form>

      {loadWarnings.map((warning) => (
        <div
          key={warning}
          role="status"
          className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/75"
        >
          {warning}
        </div>
      ))}

      <div className="space-y-3">
        {items.length === 0 && !inboxFailed && (
          <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
            <p className="text-sm font-medium text-white/60">
              No action items match these filters.
            </p>
            <p className="mt-1 text-xs text-white/35">
              Inactive modules and already-fixed issues do not appear.
            </p>
          </div>
        )}
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-white/10 bg-graphite-900/60 p-5"
          >
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-2xs font-semibold uppercase tracking-wide ${item.priority === 'urgent' ? 'bg-red-500/15 text-red-300' : item.priority === 'high' ? 'bg-orange-500/15 text-orange-300' : 'bg-blue-500/10 text-blue-300'}`}
                  >
                    {item.priority}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-2xs capitalize text-white/35">
                    {item.moduleKey.replace('_', ' ')}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-2xs capitalize text-white/35">
                    {item.status.replace('_', ' ')}
                  </span>
                </div>
                <h2 className="mt-3 text-base font-semibold text-white">{item.title}</h2>
                <p className="mt-1 text-sm leading-6 text-white/50">{item.description}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/30">
                  {item.sourceRecordLabel && <span>{item.sourceRecordLabel}</span>}
                  <span>Updated {formatInTenantTime(item.latestActivityAt, context.timeZone)}</span>
                  {item.dueAt && (
                    <span>Due {formatInTenantTime(item.dueAt, context.timeZone)}</span>
                  )}
                  <span>
                    {item.assignedUserId
                      ? 'Assigned to a staff member'
                      : item.assignedRole
                        ? `Assigned to ${item.assignedRole}`
                        : 'Unassigned'}
                  </span>
                </div>
              </div>
              <Link
                href={item.href}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gold-500 px-3 py-2 text-xs font-semibold text-graphite-950"
              >
                Open record <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {['open', 'in_progress', 'snoozed'].includes(item.status) && (
              <div className="mt-4 border-t border-white/5 pt-4">
                <ActionStatusControls
                  actionItemId={item.id}
                  canDismiss={isTenantAdmin(context.role)}
                />
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-white/8 p-3 text-xs text-white/35">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Dismissing high-priority work requires an administrator and a reason. Source records and
        audit history remain intact.
      </div>
    </div>
  )
}

function stringParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

const selectClass =
  'rounded-lg border border-white/10 bg-graphite-950 px-2.5 py-2 text-xs capitalize text-white/60'

function Select({ name, value, options }: { name: string; value?: string; options: string[] }) {
  return (
    <select name={name} defaultValue={value ?? options[0]} className={selectClass}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option.replace('_', ' ')}
        </option>
      ))}
    </select>
  )
}
