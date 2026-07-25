import { AlertTriangle, Inbox, Search } from 'lucide-react'
import { syncAndLoadActionInbox, type ActionInboxQuery } from '@/lib/command-center/actions'
import { isTenantAdmin, requireCommandCenterContext } from '@/lib/command-center/context'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState, ErrorState } from '@/components/ui/StatePanel'
import { ActionInboxWorkspace } from '@/components/command-center/ActionInboxWorkspace'

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
      <PageHeader
        eyebrow="Command center"
        title="Action Required"
        description="Review the items that need a human decision. Resolved source issues close automatically."
        icon={Inbox}
        meta={
          <span className="ui-meta">
            {items.length} matching item{items.length === 1 ? '' : 's'}
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {(['urgent', 'high', 'normal', 'low'] as const).map((priority) => (
          <div key={priority} className="ui-surface-muted p-4">
            <StatusBadge status={priority} />
            <p className="mt-3 text-2xl font-semibold tabular-nums text-white">
              {counts[priority] ?? 0}
            </p>
          </div>
        ))}
      </div>

      <form className="ui-toolbar grid md:grid-cols-6" aria-label="Filter action items">
        <label className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-white/25" />
          <input
            name="search"
            defaultValue={query.search}
            placeholder="Search actions…"
            className="ui-input min-h-10 py-2 pl-9"
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
        <label className="flex min-h-10 items-center gap-2 text-xs text-white/55">
          <input
            type="checkbox"
            name="assigned"
            value="me"
            defaultChecked={query.assignedToMe}
            className="h-4 w-4 accent-brand"
          />{' '}
          Assigned to me
        </label>
        <label className="flex min-h-10 items-center gap-2 text-xs text-white/55">
          <input
            type="checkbox"
            name="overdue"
            value="true"
            defaultChecked={query.overdue}
            className="h-4 w-4 accent-brand"
          />{' '}
          Overdue only
        </label>
        <label className="flex min-h-10 items-center gap-2 text-xs text-white/55">
          <input
            type="checkbox"
            name="review"
            value="true"
            defaultChecked={query.needsReview}
            className="h-4 w-4 accent-brand"
          />{' '}
          Needs review
        </label>
        <button className="ui-button-secondary text-xs">Apply filters</button>
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
        {inboxFailed && (
          <ErrorState
            title="We couldn’t load action items"
            description="Source records were not changed. Try again to reload the inbox."
            compact
          />
        )}
        {items.length === 0 && !inboxFailed && (
          <EmptyState
            title="No action items match these filters"
            description="Inactive modules and already-resolved issues do not appear."
            compact
          />
        )}
        {items.length > 0 && (
          <ActionInboxWorkspace
            items={items}
            canDismiss={isTenantAdmin(context.role)}
            timeZone={context.timeZone}
            initialFocusId={stringParam(params.focus)}
          />
        )}
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

const selectClass = 'ui-input min-h-10 py-2 text-xs capitalize'

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
