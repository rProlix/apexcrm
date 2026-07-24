import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ListChecks } from 'lucide-react'
import { getModuleAssistantQuestions } from '@/lib/command-center/ai'
import { loadTopActionItems } from '@/lib/command-center/actions'
import { loadActivityFeed } from '@/lib/command-center/activity'
import { loadDailySummary } from '@/lib/command-center/dailySummary'
import { loadSetupChecklist } from '@/lib/command-center/setup'
import { formatInTenantTime } from '@/lib/command-center/time'
import { requireCommandCenterContext } from '@/lib/command-center/context'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { AiAssistantPanel } from './AiAssistantPanel'

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
  await recordCommandAudit({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action: 'command_center.daily_summary.viewed',
    metadata: { state: daily.state, time_zone: daily.timeZone },
  })

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-graphite-900/60 p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-widest text-gold-400/70">
              What changed today
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">{daily.dateLabel}</h2>
            <p className="mt-1 text-xs text-white/35">
              {daily.timeZone} · refreshed{' '}
              {formatInTenantTime(daily.freshnessTimestamp, daily.timeZone)}
            </p>
          </div>
          {daily.criticalAlerts.length > 0 && (
            <Link
              href="/actions?priority=urgent"
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {daily.criticalAlerts.length} high-priority
            </Link>
          )}
        </div>

        {daily.state === 'error' ? (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200/75">
            We couldn’t load today’s summary.
          </div>
        ) : daily.state === 'empty' ? (
          <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-4 text-sm text-white/45">
            Nothing urgent changed today.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {daily.sections.map((section) => (
              <div
                key={section.moduleKey}
                className="rounded-xl border border-white/8 bg-white/[0.025] p-4"
              >
                <p className="text-xs font-semibold text-white/65">{section.title}</p>
                <ul className="mt-2 space-y-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet.id}>
                      <Link
                        href={bullet.href}
                        className="flex items-start gap-2 text-sm text-white/50 hover:text-white"
                      >
                        <span
                          className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${bullet.critical ? 'bg-red-400' : 'bg-gold-400/70'}`}
                        />
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

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-graphite-900/60 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-widest text-red-300/70">
                Action required
              </p>
              <h2 className="mt-1 text-sm font-semibold text-white">Work needing a person</h2>
            </div>
            <Link href="/actions" className="inline-flex items-center gap-1 text-xs text-gold-400">
              Open inbox <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
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
                className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3 hover:border-white/15"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${action.priority === 'urgent' ? 'bg-red-400' : action.priority === 'high' ? 'bg-orange-400' : 'bg-blue-400'}`}
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
          <section className="rounded-2xl border border-white/10 bg-graphite-900/60 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-widest text-blue-300/70">
                  Business setup
                </p>
                <h2 className="mt-1 text-sm font-semibold text-white">{setup.percent}% complete</h2>
              </div>
              <Link href="/setup" className="inline-flex items-center gap-1 text-xs text-gold-400">
                View setup <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
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
                    className="flex items-center gap-3 rounded-xl border border-white/8 p-3 text-sm text-white/55 hover:text-white"
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

      <section className="rounded-2xl border border-white/10 bg-graphite-900/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-widest text-white/30">
              Staff activity
            </p>
            <h2 className="mt-1 text-sm font-semibold text-white">Recent important changes</h2>
          </div>
          <Link href="/activity" className="inline-flex items-center gap-1 text-xs text-gold-400">
            View activity <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="mt-4 divide-y divide-white/5">
          {!activity ? (
            <p className="py-5 text-center text-xs text-red-300/70">
              We couldn’t load staff activity.
            </p>
          ) : activity.items.length === 0 ? (
            <p className="py-5 text-center text-xs text-white/35">No readable activity yet.</p>
          ) : null}
          {activity?.items.slice(0, 6).map((item) => (
            <div key={item.id} className="py-3">
              <p className="text-sm text-white/60">{item.title}</p>
              <p className="mt-1 text-xs text-white/30">
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

async function settle<T>(promise: Promise<T>): Promise<{ data: T | null; error: boolean }> {
  try {
    return { data: await promise, error: false }
  } catch {
    return { data: null, error: true }
  }
}
