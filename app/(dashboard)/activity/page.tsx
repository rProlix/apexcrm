import Link from 'next/link'
import { ArrowUpRight, Search } from 'lucide-react'
import { loadActivityFeed } from '@/lib/command-center/activity'
import { requireCommandCenterContext } from '@/lib/command-center/context'
import { formatInTenantTime } from '@/lib/command-center/time'
import { recordCommandAudit } from '@/lib/command-center/audit'

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
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
          Accountability
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">Staff Activity</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/45">
          Business-readable changes from active modules. Technical payloads, credentials, and
          owner-only diagnostics are excluded.
        </p>
      </header>

      <form className="grid gap-3 rounded-2xl border border-white/10 bg-graphite-900/60 p-4 md:grid-cols-7">
        <label className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-white/25" />
          <input
            name="search"
            defaultValue={param(params.search)}
            placeholder="Search activity…"
            className="w-full rounded-lg border border-white/10 bg-graphite-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/25"
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
        <button className="rounded-lg bg-white/8 px-3 py-2 text-xs font-medium text-white/65 hover:bg-white/12">
          Apply filters
        </button>
      </form>

      {activityFailed ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-200/75"
        >
          We couldn’t load staff activity.
        </div>
      ) : result.groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-white/40">
          No readable activity matches these filters.
        </div>
      ) : null}
      {result.groups.map((group) => (
        <section key={group.label}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/30">
            {group.label}
          </h2>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-graphite-900/60">
            {group.items.map((item, index) => (
              <article
                key={item.id}
                className={`flex items-start justify-between gap-4 p-4 ${index > 0 ? 'border-t border-white/5' : ''}`}
              >
                <div>
                  <p className="text-sm font-medium text-white/70">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/35">{item.description}</p>
                  <p className="mt-2 text-2xs capitalize text-white/25">
                    {item.moduleKey?.replace('_', ' ') ?? 'Workspace'} ·{' '}
                    {formatInTenantTime(item.occurredAt, result.timeZone)}
                  </p>
                </div>
                {item.href && (
                  <Link
                    href={item.href}
                    aria-label={`Open source record for ${item.title}`}
                    className="shrink-0 rounded-lg p-2 text-white/25 hover:bg-white/5 hover:text-white"
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

const filterClass =
  'rounded-lg border border-white/10 bg-graphite-950 px-2.5 py-2 text-xs capitalize text-white/60'
function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
