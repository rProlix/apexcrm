'use client'
// components/website/pov/PovEventDashboard.tsx
// Admin control panel for a single POV Event App: settings, counts, public
// link + QR, allow toggles, locked/unlocked preview, and media moderation.

import { useCallback, useEffect, useState } from 'react'
import {
  Copy, Check, ExternalLink, Lock, Unlock, Eye, EyeOff, Flag, Trash2,
  Image as ImageIcon, Video, Mic, Users, RefreshCw, QrCode,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  POV_EVENT_TYPE_LABELS, type PovEventRow, type PovMediaRow, type PovMediaType,
} from '@/lib/pov/types'

interface Stats {
  guests: number; media: number; photos: number; videos: number; audio: number
  pending: number; reported: number; hidden: number; unlocked: boolean; reveal_at: string
}
type MediaItem = PovMediaRow & { guest_name?: string | null }

interface Props {
  event:     PovEventRow
  publicBase: string   // e.g. https://nexoranow.com
}

const TOGGLE_FIELDS = [
  { key: 'allow_photos', label: 'Photos' },
  { key: 'allow_videos', label: '15s Videos' },
  { key: 'allow_audio',  label: '30s Audio' },
  { key: 'require_pin',  label: 'Require PIN' },
  { key: 'allow_guest_registration', label: 'Registration' },
  { key: 'allow_guest_login',        label: 'Guest Login' },
  { key: 'is_active',    label: 'Active' },
] as const

export function PovEventDashboard({ event: initialEvent, publicBase }: Props) {
  const [event, setEvent]   = useState<PovEventRow>(initialEvent)
  const [stats, setStats]   = useState<Stats | null>(null)
  const [media, setMedia]   = useState<MediaItem[]>([])
  const [filter, setFilter] = useState<'all' | PovMediaType>('all')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const publicUrl = `${publicBase}/pov/${event.slug}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(publicUrl)}`

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, m] = await Promise.all([
        fetch(`/api/pov/events/${event.id}/stats`).then((r) => r.json()),
        fetch(`/api/pov/events/${event.id}/media`).then((r) => r.json()),
      ])
      if (s.stats) setStats(s.stats)
      if (m.media) setMedia(m.media)
    } catch {
      setError('Could not load event data.')
    } finally {
      setLoading(false)
    }
  }, [event.id])

  useEffect(() => { void load() }, [load])

  async function patchEvent(patch: Record<string, unknown>) {
    const res = await fetch(`/api/pov/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const json = await res.json()
    if (res.ok && json.event) setEvent(json.event)
    else setError(json.error ?? 'Update failed')
  }

  async function moderate(id: string, status: PovMediaRow['status']) {
    const res = await fetch(`/api/pov/media/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setMedia((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x))
        .filter((x) => x.status !== 'deleted'))
      void load()
    }
  }

  async function removeMedia(id: string) {
    const res = await fetch(`/api/pov/media/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMedia((prev) => prev.filter((x) => x.id !== id))
      void load()
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const filtered = filter === 'all' ? media : media.filter((m) => m.media_type === filter)
  const unlocked = stats?.unlocked ?? false

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-2xs uppercase tracking-widest text-gold-400/70 font-semibold mb-1">
            POV Event App
          </p>
          <h1 className="text-2xl font-bold text-white tracking-tight">{event.name}</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {event.event_type ? POV_EVENT_TYPE_LABELS[event.event_type as keyof typeof POV_EVENT_TYPE_LABELS] ?? event.event_type : 'Event'}
            {event.event_date ? ` · ${event.event_date}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={publicUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm text-white/60 hover:text-white border border-white/10 hover:border-white/20 transition-colors">
            <ExternalLink className="h-3.5 w-3.5" /> Open Guest App
          </a>
          <a href={`/website/pov/${event.id}/diagnostics`}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm text-white/60 hover:text-white border border-white/10 hover:border-white/20 transition-colors">
            Diagnostics
          </a>
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* Reveal status */}
      <div className={cn(
        'rounded-2xl border px-5 py-4 flex items-center gap-4',
        unlocked ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-gold-500/8 border-gold-500/20',
      )}>
        {unlocked ? <Unlock className="h-5 w-5 text-emerald-400 shrink-0" />
                  : <Lock className="h-5 w-5 text-gold-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold', unlocked ? 'text-emerald-400' : 'text-gold-400')}>
            {unlocked ? 'Gallery is unlocked' : 'Gallery is locked'}
          </p>
          <p className="text-xs text-white/40 mt-0.5">
            Reveals {new Date(event.gallery_reveal_at).toLocaleString()} · {event.timezone}
          </p>
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard icon={Users} label="Guests" value={stats?.guests} color="text-blue-400" />
        <StatCard icon={ImageIcon} label="Photos" value={stats?.photos} color="text-violet-400" />
        <StatCard icon={Video} label="Videos" value={stats?.videos} color="text-pink-400" />
        <StatCard icon={Mic} label="Audio" value={stats?.audio} color="text-emerald-400" />
        <StatCard icon={Flag} label="Reported" value={stats?.reported} color="text-amber-400" />
      </div>

      {/* Public link + QR */}
      <div className="rounded-2xl border border-surface-border bg-graphite-800/40 p-5 flex flex-col sm:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 space-y-3">
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <QrCode className="h-4 w-4 text-gold-400" /> Public event link
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-xs text-white/60 bg-graphite-900 border border-surface-border rounded-lg px-3 py-2">
              {publicUrl}
            </code>
            <Button variant="secondary" size="sm" onClick={copyLink}>
              {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </Button>
          </div>
          <p className="text-xs text-white/30">
            Share the QR or link with guests. They register with a phone number and PIN — no app install.
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrUrl} alt="Event QR code" width={132} height={132}
          className="rounded-xl border border-surface-border bg-white p-1.5 shrink-0" />
      </div>

      {/* Allow toggles + reveal editing */}
      <div className="rounded-2xl border border-surface-border bg-graphite-800/40 p-5 space-y-4">
        <p className="text-sm font-semibold text-white">Settings</p>
        <div className="flex flex-wrap gap-2">
          {TOGGLE_FIELDS.map((t) => {
            const on = Boolean((event as unknown as Record<string, boolean>)[t.key])
            return (
              <button key={t.key} type="button"
                onClick={() => void patchEvent({ [t.key]: !on })}
                className={cn(
                  'inline-flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-medium border transition-colors',
                  on ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                     : 'bg-white/5 border-white/10 text-white/40',
                )}>
                <span className={cn('h-2 w-2 rounded-full', on ? 'bg-emerald-400' : 'bg-white/20')} />
                {t.label}
              </button>
            )
          })}
        </div>
        <label className="block max-w-sm">
          <span className="text-xs font-medium text-white/60">Gallery reveal time</span>
          <input type="datetime-local"
            defaultValue={toLocalInput(event.gallery_reveal_at)}
            onBlur={(e) => e.target.value && void patchEvent({ gallery_reveal_at: new Date(e.target.value).toISOString() })}
            className="mt-1.5 w-full h-10 px-3 rounded-xl bg-graphite-900 border border-surface-border text-sm text-white focus:border-gold-500/50 focus:outline-none" />
        </label>
      </div>

      {/* Moderation grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest">
            Media Moderation {!unlocked && <span className="ml-2 text-gold-400/70 normal-case tracking-normal">(preview — pre-reveal)</span>}
          </h2>
          <div className="flex items-center gap-1">
            {(['all', 'photo', 'video', 'audio'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn('h-8 px-3 rounded-lg text-xs font-medium capitalize transition-colors',
                  filter === f ? 'bg-gold-500/15 text-gold-400 border border-gold-500/20'
                               : 'text-white/40 hover:text-white/70 border border-transparent')}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-border py-14 text-center text-sm text-white/30">
            {loading ? 'Loading…' : 'No media yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((m) => (
              <MediaCard key={m.id} media={m}
                onHide={() => moderate(m.id, m.status === 'hidden' ? 'approved' : 'hidden')}
                onReport={() => moderate(m.id, 'reported')}
                onDelete={() => removeMedia(m.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value?: number; color: string
}) {
  return (
    <div className="rounded-2xl bg-graphite-800/60 border border-surface-border px-4 py-3">
      <Icon className={cn('h-4 w-4 mb-2', color)} strokeWidth={1.75} />
      <p className="text-xl font-bold text-white">{value ?? '—'}</p>
      <p className="text-xs text-white/40">{label}</p>
    </div>
  )
}

function MediaCard({ media, onHide, onReport, onDelete }: {
  media: MediaItem; onHide: () => void; onReport: () => void; onDelete: () => void
}) {
  const url = media.public_url ?? ''
  return (
    <div className={cn('relative rounded-xl overflow-hidden border bg-graphite-900 group',
      media.status === 'hidden' ? 'border-amber-500/30 opacity-60'
        : media.status === 'reported' ? 'border-red-500/40' : 'border-surface-border')}>
      <div className="aspect-square bg-black/40 flex items-center justify-center">
        {media.media_type === 'photo' && url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={media.caption ?? 'photo'} className="w-full h-full object-cover" />
        )}
        {media.media_type === 'video' && url && (
          <video src={url} className="w-full h-full object-cover" controls preload="metadata" />
        )}
        {media.media_type === 'audio' && (
          <div className="p-3 w-full">
            <Mic className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
            {url && <audio src={url} controls className="w-full" />}
          </div>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="text-2xs text-white/40 truncate">{media.guest_name ?? 'Guest'}</p>
        {media.caption && <p className="text-xs text-white/70 truncate">{media.caption}</p>}
      </div>
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <IconBtn title={media.status === 'hidden' ? 'Unhide' : 'Hide'} onClick={onHide}>
          {media.status === 'hidden' ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </IconBtn>
        <IconBtn title="Report" onClick={onReport}><Flag className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="Delete" onClick={onDelete} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
      </div>
      {media.status !== 'approved' && (
        <span className="absolute top-1.5 left-1.5 text-2xs px-1.5 py-0.5 rounded bg-black/70 text-white/80 capitalize">
          {media.status}
        </span>
      )}
    </div>
  )
}

function IconBtn({ children, title, onClick, danger }: {
  children: React.ReactNode; title: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button title={title} onClick={onClick}
      className={cn('h-7 w-7 rounded-lg flex items-center justify-center backdrop-blur-sm transition-colors',
        danger ? 'bg-red-500/30 text-red-200 hover:bg-red-500/50'
               : 'bg-black/50 text-white/80 hover:bg-black/70')}>
      {children}
    </button>
  )
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
