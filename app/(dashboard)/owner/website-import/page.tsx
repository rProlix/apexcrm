// app/(dashboard)/owner/website-import/page.tsx
// Platform-level owner view — see all import jobs across all tenants.
import { requireOwner } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ImportStatusBadge } from '@/components/website-import/ImportStatusBadge'
import { ConfidenceMeter } from '@/components/website-import/ConfidenceMeter'

export const metadata = { title: 'Website Imports (Owner) — Admin' }

export default async function OwnerWebsiteImportPage() {
  await requireOwner()

  const db = getSupabaseServerClient()

  const { data: jobs } = await db
    .from('website_import_jobs')
    .select(`
      id, tenant_id, status, progress, source_urls,
      error_message, started_at, completed_at, created_at,
      website_import_sources(id, source_url, source_type, fetched_status, confidence_score)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  // Load tenant names
  const tenantIds = [...new Set((jobs ?? []).map((j) => j.tenant_id))]
  const { data: tenants } = tenantIds.length
    ? await db.from('tenants').select('id, name').in('id', tenantIds)
    : { data: [] }

  const tenantMap = Object.fromEntries((tenants ?? []).map((t) => [t.id, t.name]))

  return (
    <div className="space-y-8 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Website Imports</h1>
          <p className="text-sm text-white/40 mt-0.5">
            All tenant import jobs — platform-wide view
          </p>
        </div>
      </div>

      {/* Jobs table */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left font-medium">Tenant</th>
                <th className="px-4 py-3 text-left font-medium">Sources</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Progress</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(jobs ?? []).map((job) => {
                const sources = (job.website_import_sources ?? []) as Array<{
                  source_url: string
                  source_type: string
                  fetched_status: string
                  confidence_score: number
                }>
                const avgConf = sources.length
                  ? sources.reduce((s, r) => s + r.confidence_score, 0) / sources.length
                  : 0

                return (
                  <tr key={job.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white/80 font-medium">
                      {tenantMap[job.tenant_id] ?? job.tenant_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      <div className="flex flex-col gap-0.5">
                        {sources.slice(0, 2).map((s, i) => (
                          <span key={i} className="truncate max-w-[200px] text-xs">
                            {s.source_url}
                          </span>
                        ))}
                        {sources.length > 2 && (
                          <span className="text-white/30 text-xs">+{sources.length - 2} more</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ImportStatusBadge status={job.status as 'queued' | 'running' | 'completed' | 'failed' | 'canceled'} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-400/80"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-white/40 text-xs">{job.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs">
                      {new Date(job.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/website/import/${job.id}`}
                        className="text-amber-400/80 hover:text-amber-300 text-xs font-medium transition-colors"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}

              {(jobs ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-white/30 text-sm">
                    No import jobs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
