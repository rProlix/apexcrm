export const dynamic = 'force-dynamic'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Pill'
import { formatDate } from '@/lib/utils'

// Platform admin only — this page should be protected in middleware or layout
// by checking the user's role === 'platform_admin'

export default async function TenantsPage() {
  const supabase = getSupabaseServerClient()

  // TODO: verify platform admin role from session before rendering
  // For now this page is accessible if you know the route

  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('*, subscriptions(status, current_period_end, plans(name))')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Tenants</h1>
          <p className="text-sm text-white/40">Platform admin — all tenant accounts</p>
        </div>
        <div className="text-xs text-white/25 bg-graphite-700 border border-graphite-500 rounded-xl px-3 py-1.5">
          Platform Admin
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error.message}
        </p>
      )}

      {/* Tenant table */}
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/6">
                {['Name', 'Slug', 'Subdomain', 'Plan', 'Status', 'Created'].map((col) => (
                  <th
                    key={col}
                    className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-5 py-3"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/4">
              {(tenants ?? []).map((t) => {
                const sub = (t as unknown as { subscriptions?: Array<{ plans?: { name?: string }; status?: string }> }).subscriptions?.[0]
                return (
                  <tr key={t.id} className="hover:bg-white/2 transition-colors duration-100">
                    <td className="px-5 py-3 font-medium text-white">{t.name}</td>
                    <td className="px-5 py-3 text-white/50 font-mono text-xs">{t.slug}</td>
                    <td className="px-5 py-3 text-white/40 text-xs">{t.subdomain ?? '—'}</td>
                    <td className="px-5 py-3 text-white/50 text-xs">
                      {sub?.plans?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Pill label={t.status} status={t.status} />
                    </td>
                    <td className="px-5 py-3 text-white/30 text-xs">
                      {formatDate(t.created_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {(!tenants || tenants.length === 0) && (
            <p className="text-center text-white/25 text-sm py-12">No tenants found.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
