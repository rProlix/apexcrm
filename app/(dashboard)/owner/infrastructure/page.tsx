export const dynamic = 'force-dynamic'

import { CheckCircle2, CircleAlert, ServerCog, ShieldCheck } from 'lucide-react'
import { requirePlatformOwner } from '@/lib/auth/platform-owner'
import {
  auditInfrastructureAction,
  getRedactedInfrastructureStatus,
} from '@/lib/server/infrastructure/status'

export const metadata = { title: 'Infrastructure Configuration' }

export default async function InfrastructureConfigurationPage() {
  const owner = await requirePlatformOwner()
  const status = getRedactedInfrastructureStatus()
  await auditInfrastructureAction(owner.id, 'infrastructure_configuration.accessed', {
    healthy: status.ok,
    deployment_environment: status.deploymentEnvironment,
  })

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-gold-400/10 p-2.5 text-gold-300">
            <ServerCog className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-white">Infrastructure Configuration</h1>
            <p className="mt-1 text-sm text-white/45">
              Redacted platform health and configuration presence for platform owners.
            </p>
          </div>
        </div>
      </header>

      <div
        className={`flex items-start gap-3 rounded-xl border p-4 ${
          status.ok
            ? 'border-emerald-400/20 bg-emerald-400/10'
            : 'border-amber-400/20 bg-amber-400/10'
        }`}
      >
        {status.ok ? (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
        ) : (
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        )}
        <div>
          <p className="text-sm font-medium text-white">
            {status.ok ? 'Infrastructure is configured' : 'Configuration requires attention'}
          </p>
          <p className="mt-1 text-xs text-white/50">
            Environment: {status.deploymentEnvironment}. Credentials are never returned to this
            page.
          </p>
        </div>
      </div>

      <section aria-labelledby="configuration-status-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="configuration-status-heading" className="font-semibold text-white">
            Configuration status
          </h2>
          <p className="text-xs text-white/35">
            Checked{' '}
            {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
              new Date(status.checkedAt)
            )}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {status.checks.map((check) => (
            <article
              key={check.key}
              className="rounded-xl border border-white/10 bg-graphite-800 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-white">{check.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-white/40">{check.description}</p>
                </div>
                {check.configured ? (
                  <CheckCircle2
                    aria-label="Configured"
                    className="h-5 w-5 shrink-0 text-emerald-300"
                  />
                ) : (
                  <CircleAlert
                    aria-label="Missing configuration"
                    className="h-5 w-5 shrink-0 text-amber-300"
                  />
                )}
              </div>
              <p
                className={`mt-4 text-xs font-medium ${check.configured ? 'text-emerald-300' : 'text-amber-300'}`}
              >
                {check.configured ? 'Configured' : 'Missing'}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
