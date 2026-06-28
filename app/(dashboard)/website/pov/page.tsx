export const dynamic = 'force-dynamic'

// app/(dashboard)/website/pov/page.tsx
// Lists the tenant's POV Event Apps with a link to create a new one.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { povDb } from '@/lib/pov/db'
import { Button } from '@/components/ui/Button'
import { Camera, Plus, Lock, Unlock, ArrowRight } from 'lucide-react'
import { POV_EVENT_TYPE_LABELS, type PovEventRow } from '@/lib/pov/types'

export const metadata = { title: 'POV Event Apps' }

export default async function PovListPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) redirect('/dashboard?error=no_tenant')

  const { data } = await povDb()
    .from('pov_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  const events = (data ?? []) as PovEventRow[]
  const now = Date.now()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Camera className="h-5 w-5 text-gold-400" /> POV Event Apps
          </h1>
          <p className="text-sm text-white/40 mt-0.5">
            Private event cameras — guests upload photos, clips, and audio that reveal the next day.
          </p>
        </div>
        <Link href="/website/create">
          <Button variant="primary"><Plus className="h-4 w-4" /> New Event App</Button>
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-surface-border">
          <div className="h-16 w-16 rounded-2xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center mb-4">
            <Camera className="h-8 w-8 text-gold-400/60" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">No event apps yet</h3>
          <p className="text-sm text-white/40 mb-6 max-w-xs">
            Create a POV Event App for a wedding, party, or celebration.
          </p>
          <Link href="/website/create">
            <Button variant="primary"><Plus className="h-4 w-4" /> Create POV Event App</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((e) => {
            const unlocked = new Date(e.gallery_reveal_at).getTime() <= now
            return (
              <Link key={e.id} href={`/website/pov/${e.id}`}
                className="group rounded-2xl bg-graphite-800/60 border border-surface-border hover:border-white/20 p-5 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xs uppercase tracking-widest text-gold-400/70 font-semibold">
                    {e.event_type ? POV_EVENT_TYPE_LABELS[e.event_type as keyof typeof POV_EVENT_TYPE_LABELS] ?? e.event_type : 'Event'}
                  </span>
                  <span className={unlocked ? 'text-emerald-400' : 'text-gold-400'}>
                    {unlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  </span>
                </div>
                <p className="text-base font-semibold text-white group-hover:text-gold-400 transition-colors truncate">{e.name}</p>
                <p className="text-xs text-white/40 mt-1">
                  {e.event_date ?? 'No date'} · reveals {new Date(e.gallery_reveal_at).toLocaleDateString()}
                </p>
                <div className="mt-4 flex items-center gap-1 text-xs text-white/30 group-hover:text-white/60 transition-colors">
                  Open dashboard <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
