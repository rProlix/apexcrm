import Link from 'next/link'
import { ArrowRight, ArrowUpRight, CheckCircle2, Clock3, ListChecks, Radar } from 'lucide-react'
import { getModuleAssistantQuestions } from '@/lib/command-center/ai'
import { loadTopActionItems } from '@/lib/command-center/actions'
import { loadActivityFeed } from '@/lib/command-center/activity'
import { loadDailySummary } from '@/lib/command-center/dailySummary'
import { loadSetupChecklist } from '@/lib/command-center/setup'
import { formatInTenantTime } from '@/lib/command-center/time'
import { requireCommandCenterContext } from '@/lib/command-center/context'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { AiAssistantPanel } from './AiAssistantPanel'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { DashboardRealtimeRefresh } from './DashboardRealtimeRefresh'

export async function CommandCenterDashboard() {
  const context = await requireCommandCenterContext('view_dashboard')
  const [actionsResult, setupResult, activityResult, daily] = await Promise.all([
    settle(loadTopActionItems(5)),
    settle(loadSetupChecklist()),
    settle(loadActivityFeed()),
    loadDailySummary(context),
  ])
  const actions = actionsResult.data ?? []
  const setup = setupResult.data
  const activity = activityResult.data
  const assistantGroups = getModuleAssistantQuestions(context.activeModuleKeys)
  const changeCount = daily.sections.reduce((total, section) => total + section.bullets.length, 0)
  const setupPercent = setup?.percent ?? 0
  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.daily_summary.viewed',
    metadata: { state: daily.state, time_zone: daily.timeZone },
  })

  return (
    <div className="space-y-6">
      <DashboardRealtimeRefresh />
      <section className="ui-command-deck overflow-hidden">
        <div className="ui-command-deck-head">
          <div className="flex items-start gap-4">
            <div className="ui-command-orbit" aria-hidden="true">
              <Radar className="h-5 w-5 text-brand" />
            </div>
            <div>
              <p className="text-xs font-medium text-brand/75">Live operational brief</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-white sm:text-[1.75rem]">
                Today at a glance
              </h2>
              <p className="mt-2 text-xs text-white/40">
                {daily.dateLabel} <span className="mx-1.5 text-white/15">/</span> refreshed{' '}
                {formatInTenantTime(daily.freshnessTimestamp, daily.timeZone)}
              </p>
            </div>
          </div>
          <Link href="/actions" className="ui-command-primary focus-ring">
            Review priorities
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="ui-command-metrics" aria-label="Workspace status">
          <CommandMetric
            label="Open priorities"
            value={actionsResult.error ? 'Unavailable' : String(actions.length)}
            detail={actions.length === 1 ? 'item needs review' : 'items need review'}
            tone={actions.length > 0 ? 'attention' : 'neutral'}
          />
          <CommandMetric
            label="Changes today"
            value={daily.state === 'error' ? 'Unavailable' : String(changeCount)}
            detail={`${daily.sections.length} active area${daily.sections.length === 1 ? '' : 's'}`}
          />
          <CommandMetric
            label="Workspace setup"
            value={setup ? `${setupPercent}%` : 'Unavailable'}
            detail={
              setup?.allRequiredComplete ? 'required setup complete' : 'configuration progress'
            }
          />
          <CommandMetric
            label="System state"
            value={daily.criticalAlerts.length > 0 ? 'Attention' : 'Clear'}
            detail={
              daily.criticalAlerts.length > 0
                ? `${daily.criticalAlerts.length} high-priority alert${daily.criticalAlerts.length === 1 ? '' : 's'}`
                : 'no critical alerts'
            }
            tone={daily.criticalAlerts.length > 0 ? 'critical' : 'positive'}
          />
        </div>

        {daily.state === 'error' ? (
          <div className="mx-5 mb-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200/75 sm:mx-6">
            We couldn’t load today’s summary.
          </div>
        ) : daily.state === 'empty' ? (
          <div className="mx-5 mb-5 rounded-xl border border-white/8 bg-white/[0.02] p-4 text-sm text-white/45 sm:mx-6">
            Nothing urgent changed today.
          </div>
        ) : (
          <div className="grid gap-px border-t border-white/[0.06] bg-white/[0.06] md:grid-cols-2 xl:grid-cols-3">
            {daily.sections.map((section) => (
              <div key={section.moduleKey} className="ui-command-stream p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-white/75">{section.title}</p>
                  <span className="font-mono text-2xs tabular-nums text-white/25">
                    {section.bullets.length.toString().padStart(2, '0')}
                  </span>
                </div>
                <ul className="mt-2 space-y-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet.id}>
                      <Link
                        href={bullet.href}
                        className="ui-briefing-link focus-ring -mx-2 flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm leading-5 text-white/55 hover:text-white"
                      >
                        <span className="mt-0.5 shrink-0">
                          <StatusBadge
                            status={bullet.critical ? 'critical' : 'info'}
                            label={bullet.critical ? 'Critical' : 'Update'}
                            icon={bullet.critical}
                            className="min-h-5 px-1.5 text-2xs"
                          />
                        </span>
                        {bullet.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <section className="ui-surface p-5 sm:p-6">
          <SectionHeader
            eyebrow="Action required"
            title="Work needing a person"
            description="The highest-priority decisions awaiting review."
            action={<SectionLink href="/actions" label="Open inbox" />}
          />
          <div className="mt-4 space-y-2">
            {actionsResult.error ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-200/75">
                We couldn’t load action items.
              </div>
            ) : actions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-white/35">
                No open action items.
              </div>
            ) : null}
            {actions.map((action) => (
              <Link
                key={action.id}
                href={action.href}
                className="ui-list-row focus-ring flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.018] p-3.5"
              >
                <StatusBadge
                  status={action.priority}
                  label={action.priority}
                  className="shrink-0 capitalize"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white/70">{action.title}</p>
                  <p className="mt-1 text-xs capitalize text-white/30">
                    {action.moduleKey.replace('_', ' ')} · {action.priority}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {!setup ? (
          <section className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
            <h2 className="text-sm font-semibold text-white">Business setup unavailable</h2>
            <p className="mt-1 text-xs text-red-200/65">
              We couldn’t load setup progress. No steps were marked complete.
            </p>
          </section>
        ) : !setup.allRequiredComplete && setup.items.length > 0 ? (
          <section className="ui-surface p-5 sm:p-6">
            <SectionHeader
              eyebrow="Business setup"
              title={`${setup.percent}% complete`}
              description="Finish the remaining steps to unlock the full workspace."
              action={<SectionLink href="/setup" label="View setup" />}
            />
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gold-400"
                style={{ width: `${setup.percent}%` }}
              />
            </div>
            <div className="mt-4 space-y-2">
              {setup.items
                .filter((item) => item.status !== 'complete' && item.status !== 'dismissed')
                .slice(0, 4)
                .map((item) => (
                  <Link
                    key={`${item.moduleKey}:${item.stepKey}`}
                    href={item.actionHref}
                    className="ui-list-row focus-ring flex items-center gap-3 rounded-xl border border-white/[0.07] p-3 text-sm text-white/55"
                  >
                    {item.status === 'blocked' ? (
                      <Clock3 className="h-4 w-4 text-amber-400" />
                    ) : (
                      <ListChecks className="h-4 w-4 text-blue-400" />
                    )}
                    <span>{item.title}</span>
                  </Link>
                ))}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-5">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <h2 className="mt-3 text-sm font-semibold text-white">Required setup is complete</h2>
            <p className="mt-1 text-xs text-white/40">
              Optional setup remains available from the Setup page.
            </p>
          </section>
        )}
      </div>

      <section className="ui-surface p-5 sm:p-6">
        <SectionHeader
          eyebrow="Staff activity"
          title="Recent important changes"
          description="A concise record of meaningful workspace activity."
          action={<SectionLink href="/activity" label="View activity" />}
        />
        <div className="mt-4 divide-y divide-white/5">
          {!activity ? (
            <p className="py-5 text-center text-xs text-red-300/70">
              We couldn’t load staff activity.
            </p>
          ) : activity.items.length === 0 ? (
            <p className="py-5 text-center text-xs text-white/35">No readable activity yet.</p>
          ) : null}
          {activity?.items.slice(0, 6).map((item) => (
            <div
              key={item.id}
              className="group flex flex-col items-start justify-between gap-1 py-3.5 sm:flex-row sm:items-center sm:gap-4"
            >
              <p className="text-sm text-white/60">{item.title}</p>
              <p className="shrink-0 text-xs text-white/30">
                {formatInTenantTime(item.occurredAt, context.timeZone)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <AiAssistantPanel groups={assistantGroups} />
    </div>
  )
}

function CommandMetric({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string
  value: string
  detail: string
  tone?: 'neutral' | 'attention' | 'critical' | 'positive'
}) {
  const toneClass = {
    neutral: 'text-white',
    attention: 'text-amber-200',
    critical: 'text-red-200',
    positive: 'text-emerald-200',
  }[tone]

  return (
    <div className="ui-command-metric">
      <p className="text-2xs font-medium text-white/35">{label}</p>
      <p className={`mt-2 text-xl font-semibold tracking-[-0.035em] tabular-nums ${toneClass}`}>
        {value}
      </p>
      <p className="mt-1 truncate text-2xs text-white/25">{detail}</p>
    </div>
  )
}

function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="focus-ring inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-brand hover:bg-brand/[0.06]"
    >
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  )
}

async function settle<T>(promise: Promise<T>): Promise<{ data: T | null; error: boolean }> {
  try {
    return { data: await promise, error: false }
  } catch {
    return { data: null, error: true }
  }
}
