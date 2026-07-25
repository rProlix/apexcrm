import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle, Clock3, LockKeyhole } from 'lucide-react'
import { loadSetupChecklist } from '@/lib/command-center/setup'
import { isTenantAdmin, requireCommandCenterContext } from '@/lib/command-center/context'
import { SetupStepActions } from '@/components/command-center/SetupStepActions'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState } from '@/components/ui/StatePanel'
import { StatusBadge } from '@/components/ui/StatusBadge'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const context = await requireCommandCenterContext('view_dashboard')
  let checklist: Awaited<ReturnType<typeof loadSetupChecklist>>
  try {
    checklist = await loadSetupChecklist()
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Business setup"
          title="Smart Setup Checklist"
          description="Finish the configuration required by your active modules."
          icon={CheckCircle2}
        />
        <ErrorState
          title="We couldn’t load setup progress"
          description="No steps were marked complete. Try again to reload the authoritative setup state."
          compact
        />
      </div>
    )
  }
  const groups = Array.from(new Set(checklist.items.map((item) => item.moduleKey)))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business setup"
        title="Smart Setup Checklist"
        description="Steps come from active modules and complete only when the underlying business data is actually configured."
        icon={CheckCircle2}
        meta={
          <StatusBadge
            status={checklist.allRequiredComplete ? 'complete' : 'in_progress'}
            label={
              checklist.allRequiredComplete
                ? 'Required setup complete'
                : `${checklist.completed} of ${checklist.required} complete`
            }
          />
        }
      />

      <section className="ui-surface p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-white/35">Required setup</p>
            <p className="mt-1 text-2xl font-semibold text-white">{checklist.percent}%</p>
          </div>
          <p className="text-xs text-white/35">
            {checklist.completed} of {checklist.required} complete
          </p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${checklist.percent}%` }}
          />
        </div>
      </section>

      {groups.map((moduleKey) => (
        <section key={moduleKey} className="ui-surface p-5">
          <h2 className="text-sm font-semibold capitalize text-white">
            {moduleKey.replace('_', ' ')}
          </h2>
          <div className="mt-4 divide-y divide-white/5">
            {checklist.items
              .filter((item) => item.moduleKey === moduleKey)
              .map((item) => (
                <div
                  key={item.stepKey}
                  className="flex flex-col justify-between gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-3">
                    {item.status === 'complete' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    ) : item.status === 'blocked' ? (
                      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    ) : item.status === 'in_progress' ? (
                      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-white/20" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-white/70">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-white/35">{item.description}</p>
                      {item.blocker && (
                        <p className="mt-1 text-xs text-amber-300/70">{item.blocker}</p>
                      )}
                      {!item.required && (
                        <span className="mt-2 inline-block rounded-full bg-white/5 px-2 py-1 text-2xs text-white/30">
                          Optional
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    {item.status !== 'complete' && item.status !== 'dismissed' && (
                      <Link
                        href={item.actionHref}
                        className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-brand hover:brightness-110"
                      >
                        {item.actionLabel}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                    {!item.required &&
                      item.status !== 'complete' &&
                      item.status !== 'dismissed' &&
                      isTenantAdmin(context.role) && (
                        <SetupStepActions moduleKey={item.moduleKey} stepKey={item.stepKey} />
                      )}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  )
}
