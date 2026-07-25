import Link from 'next/link'
import { ArrowUpRight, Search } from 'lucide-react'
import { loadActivityFeed } from '@/lib/command-center/activity'
import { requireCommandCenterContext } from '@/lib/command-center/context'
import { formatInTenantTime } from '@/lib/command-center/time'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState } from '@/components/ui/StatePanel'

export const dynamic = 'force-dynamic'

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const context = await requireCommandCenterContext('view_dashboard')
  let activityFailed = false
  let result: Awaited<ReturnType<typeof loadActivityFeed>>
  try {
    result = await loadActivityFeed({
      search: param(params.search),
      module: param(params.module),
      actor: param(params.actor),
      actionType: param(params.type),
      dateFrom: param(params.from),
      dateTo: param(params.to),
    })
  } catch {
    activityFailed = true
    result = {
      items: [],
      groups: [],
      timeZone: context.timeZone,
      actors: [],
      actionTypes: [],
    }
  }
  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.activity.viewed',
    metadata: {
      module_filter: param(params.module) ?? 'all',
      date_from: param(params.from),
      date_to: param(params.to),
    },
  })

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Accountability"
        title="Staff activity"
        description="Business-readable changes from active modules. Technical payloads, credentials, and owner-only diagnostics are excluded."
      />

      <form className="ui-toolbar grid gap-3 xl:grid-cols-7">
        <label className="relative xl:col-span-2">
          <span className="sr-only">Search staff activity</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            name="search"
            defaultValue={param(params.search)}
            placeholder="Search activity…"
            className="ui-input w-full py-2 pl-9 pr-3"
          />
        </label>
        <select name="module" defaultValue={param(params.module) ?? 'all'} className={filterClass}>
          <option value="all">All modules</option>
          {context.activeModuleKeys.map((moduleKey) => (
            <option key={moduleKey} value={moduleKey}>
              {moduleKey.replace('_', ' ')}
            </option>
          ))}
        </select>
        <select name="actor" defaultValue={param(params.actor) ?? 'all'} className={filterClass}>
          <option value="all">All actors</option>
          {result.actors.map((actor) => (
            <option key={actor} value={actor}>
              {actor}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={param(params.type) ?? 'all'} className={filterClass}>
          <option value="all">All actions</option>
          {result.actionTypes.map((actionType) => (
            <option key={actionType} value={actionType}>
              {actionType.replace(/[._-]+/g, ' ')}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={param(params.from)}
          aria-label="From date"
          className={filterClass}
        />
        <input
          type="date"
          name="to"
          defaultValue={param(params.to)}
          aria-label="To date"
          className={filterClass}
        />
        <button className="ui-button ui-button-secondary">Apply filters</button>
      </form>

      {activityFailed ? (
        <ErrorState
          title="Staff activity is unavailable"
          description="We couldn’t load the activity feed. Refresh to try again."
        />
      ) : result.groups.length === 0 ? (
        <EmptyState
          title="No activity found"
          description="No readable activity matches the current filters."
        />
      ) : null}
      {result.groups.map((group) => (
        <section key={group.label}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            {group.label}
          </h2>
          <div className="ui-surface overflow-hidden">
            {group.items.map((item, index) => (
              <article
                key={item.id}
                className={`flex items-start justify-between gap-4 p-4 transition-colors hover:bg-white/[0.025] ${index > 0 ? 'border-t border-[var(--border-subtle)]' : ''}`}
              >
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    {item.description}
                  </p>
                  <p className="mt-2 text-2xs capitalize text-[var(--text-tertiary)]">
                    {item.moduleKey?.replace('_', ' ') ?? 'Workspace'} ·{' '}
                    {formatInTenantTime(item.occurredAt, result.timeZone)}
                  </p>
                </div>
                {item.href && (
                  <Link
                    href={item.href}
                    aria-label={`Open source record for ${item.title}`}
                    className="focus-ring shrink-0 rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-white/5 hover:text-white"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const filterClass = 'ui-input min-w-0 px-2.5 py-2 text-xs capitalize'
function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
