export const dynamic = 'force-dynamic'

import {
  AlertTriangle,
  ArchiveRestore,
  Gauge,
  HardDrive,
  ImageIcon,
  PiggyBank,
  ServerCog,
  Sparkles,
} from 'lucide-react'
import { requirePlatformOwner } from '@/lib/auth/platform-owner'
import { auditInfrastructureAction } from '@/lib/server/infrastructure/status'
import { loadOwnerImageOperationsSummary } from '@/lib/server/operations/image-operations'

export const metadata = { title: 'Image Operations — Owner' }

export default async function OwnerImageOperationsPage() {
  const owner = await requirePlatformOwner()
  const summary = await loadOwnerImageOperationsSummary()
  await auditInfrastructureAction(owner.id, 'image_operations.accessed', {
    active_jobs: summary.queue.activeJobs,
    failed_jobs: summary.queue.failedJobs,
  })

  const totalStorage = summary.storage.originalBytes + summary.storage.derivativeBytes

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[radial-gradient(circle_at_20%_20%,rgba(255,206,92,0.18),transparent_32%),linear-gradient(135deg,rgba(19,19,24,0.96),rgba(8,9,13,0.98))] p-6 shadow-2xl shadow-black/30">
        <div className="absolute right-6 top-6 h-24 w-24 rounded-full border border-gold-300/20 bg-gold-300/10 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="ui-eyebrow">Owner operations</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Image storage, AI cache, and queue control tower
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/52">
              Private evidence stays protected while derivatives, duplicate reuse, cache savings,
              and lifecycle controls keep high-volume fleet tenants economically sane.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/55">
            Checked{' '}
            {new Intl.DateTimeFormat('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(summary.generatedAt))}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={HardDrive}
          label="Private evidence storage"
          value={formatBytes(totalStorage)}
          detail={`${formatBytes(summary.storage.originalBytes)} original · ${formatBytes(summary.storage.derivativeBytes)} derivatives`}
        />
        <MetricCard
          icon={ImageIcon}
          label="Stored inspection images"
          value={summary.images.imageCount.toLocaleString()}
          detail={`${summary.images.imagesToday.toLocaleString()} uploaded today`}
        />
        <MetricCard
          icon={Sparkles}
          label="AI cache hit rate"
          value={`${summary.ai.cacheHitRate}%`}
          detail={`${summary.ai.cacheHits.toLocaleString()} hits · ${summary.ai.cacheMisses.toLocaleString()} misses`}
        />
        <MetricCard
          icon={PiggyBank}
          label="Estimated AI cost avoided"
          value={formatMoney(summary.ai.estimatedCostAvoided)}
          detail={`${formatMoney(summary.ai.estimatedCost)} recorded AI cost`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-2xl border border-white/[0.08] bg-graphite-900/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="ui-eyebrow">Queue health</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Worker throughput</h2>
            </div>
            <Gauge className="h-5 w-5 text-gold-300" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniStat label="Active jobs" value={summary.queue.activeJobs.toLocaleString()} />
            <MiniStat label="Failed jobs" value={summary.queue.failedJobs.toLocaleString()} />
            <MiniStat
              label="Oldest active"
              value={
                summary.queue.oldestActiveJob
                  ? new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(new Date(summary.queue.oldestActiveJob))
                  : 'None'
              }
            />
          </div>
          <div className="mt-5 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-sm font-medium text-white">Cost-control posture</p>
            <p className="mt-2 text-sm leading-6 text-white/45">
              Exact duplicate uploads can reuse tenant-scoped originals and cached damage analysis
              when the hash, task version, prompt version, preprocessing version, and capability
              version all match.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-graphite-900/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="ui-eyebrow">Lifecycle alerts</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Owner attention</h2>
            </div>
            <AlertTriangle className="h-5 w-5 text-gold-300" />
          </div>
          <div className="mt-4 space-y-3">
            {summary.alerts.map((alert) => (
              <div
                key={alert.title}
                className={`rounded-xl border p-3 ${
                  alert.tone === 'critical'
                    ? 'border-red-400/20 bg-red-400/10'
                    : alert.tone === 'warn'
                      ? 'border-amber-300/20 bg-amber-300/10'
                      : 'border-emerald-300/20 bg-emerald-300/10'
                }`}
              >
                <p className="text-sm font-medium text-white">{alert.title}</p>
                <p className="mt-1 text-xs leading-5 text-white/48">{alert.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <PolicyCard
          icon={ArchiveRestore}
          title="Retention and archive"
          body="Original evidence is retained by policy, legal hold blocks deletion, and destructive deletion remains dry-run/controlled by default."
        />
        <PolicyCard
          icon={ServerCog}
          title="Private delivery"
          body="Fleet cards request thumbnails, detail views request medium derivatives, and original evidence requires an explicit authorized signed URL."
        />
        <PolicyCard
          icon={HardDrive}
          title="Lifecycle tags"
          body="S3 objects receive tenant, asset-type, evidence-class, retention-class, policy-version, and legal-hold tags without secrets or PII."
        />
      </section>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof HardDrive
  label: string
  value: string
  detail: string
}) {
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-graphite-900/80 p-5">
      <Icon className="h-5 w-5 text-gold-300" />
      <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-white/35">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs text-white/42">{detail}</p>
    </article>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.035] p-4">
      <p className="text-xs text-white/35">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  )
}

function PolicyCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof HardDrive
  title: string
  body: string
}) {
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
      <Icon className="h-5 w-5 text-gold-300" />
      <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/45">{body}</p>
    </article>
  )
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 10 ? 0 : 2,
  }).format(value)
}
