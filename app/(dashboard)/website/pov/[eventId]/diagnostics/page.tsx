export const dynamic = 'force-dynamic'

// app/(dashboard)/website/pov/[eventId]/diagnostics/page.tsx
// Admin diagnostics for a POV Event App.

import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { resolveEvent } from '@/lib/pov/events'
import { canManageEvent } from '@/lib/pov/admin'
import { buildPovDiagnostics } from '@/lib/pov/diagnostics'
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react'

export const metadata = { title: 'POV Diagnostics' }

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

interface Props { params: Promise<{ eventId: string }> }

export default async function PovDiagnosticsPage({ params }: Props) {
  const ctx = await requireRole(['owner', 'admin'])
  const { eventId } = await params
  const event = await resolveEvent(eventId)
  if (!event) notFound()
  if (!canManageEvent(ctx, event)) redirect('/website/pov')

  const publicBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? `https://${ROOT_DOMAIN}`
  const diag = await buildPovDiagnostics(event, publicBase)

  const rows: Array<[string, React.ReactNode]> = [
    ['Website type', diag.website_type ?? '—'],
    ['POV enabled', diag.pov_enabled ? 'Yes' : 'No'],
    ['Linked pov_event id', <code key="id" className="text-xs">{diag.event_id}</code>],
    ['Slug', diag.slug],
    ['Reveal time', new Date(diag.reveal_at).toLocaleString()],
    ['Timezone', diag.timezone],
    ['Gallery', diag.gallery_unlocked ? 'Unlocked' : 'Locked'],
    ['Active', diag.is_active ? 'Yes' : 'No'],
    ['Guest registration enabled', diag.guest_registration_enabled ? 'Yes' : 'No'],
    ['Guest login enabled', diag.guest_login_enabled ? 'Yes' : 'No'],
    ['Active guest sessions', diag.active_sessions],
    ['Guests', diag.counts.guests],
    ['Media (total)', diag.counts.media],
    ['Photos', diag.counts.photos],
    ['Videos', diag.counts.videos],
    ['Audio', diag.counts.audio],
    ['Active sessions', diag.counts.sessions],
    ['Allow photos / videos / audio', `${diag.upload_settings.allow_photos} / ${diag.upload_settings.allow_videos} / ${diag.upload_settings.allow_audio}`],
    ['Video max / Audio max (s)', `${diag.upload_settings.video_max_seconds} / ${diag.upload_settings.audio_max_seconds}`],
    ['Require PIN', diag.upload_settings.require_pin ? 'Yes' : 'No'],
    ['Public route', <a key="r" href={diag.public_route} target="_blank" rel="noreferrer" className="text-gold-400 underline">{diag.public_route}</a>],
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={`/website/pov/${event.id}`} className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold text-white tracking-tight">Diagnostics — {event.name}</h1>
      </div>

      <div className={`rounded-2xl border px-5 py-4 flex items-center gap-3 ${diag.storage.exists ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-red-500/8 border-red-500/20'}`}>
        {diag.storage.exists
          ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          : <XCircle className="h-5 w-5 text-red-400" />}
        <div>
          <p className="text-sm font-semibold text-white">
            Storage bucket: {diag.storage.bucket} — {diag.storage.exists ? 'OK' : 'Missing'}
          </p>
          <p className="text-xs text-white/40">
            {diag.storage.exists
              ? `public=${String(diag.storage.public)}`
              : diag.storage.error ?? 'Run migration 078 to create the bucket.'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border overflow-hidden">
        {rows.map(([k, v], i) => (
          <div key={k} className={`flex items-center justify-between gap-4 px-5 py-3 ${i !== 0 ? 'border-t border-surface-border' : ''}`}>
            <span className="text-xs text-white/40">{k}</span>
            <span className="text-sm text-white text-right break-all">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
