'use client'
// components/website/WebsiteTypeSelector.tsx
// "What are you building?" — the builder/app-type creation step.
// Business / Creative / Invitational set site_settings.website_type and return
// to the builder. POV Event App reveals the event setup form and creates a
// linked pov_events row.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Store, Palette, PartyPopper, Camera, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  WEBSITE_TYPE_OPTIONS, POV_EVENT_TYPES, POV_EVENT_TYPE_LABELS, POV_THEMES,
  type WebsiteType,
} from '@/lib/pov/types'

const ICONS: Record<WebsiteType, React.ElementType> = {
  business:     Store,
  creative:     Palette,
  invitational: PartyPopper,
  pov_event:    Camera,
}

const COMMON_TZ = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'UTC',
]

function nextDayNineAmLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  tenantId:     string
  currentType?: WebsiteType
}

export function WebsiteTypeSelector({ tenantId, currentType }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<WebsiteType | null>(currentType ?? null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // POV setup form state
  const [pov, setPov] = useState({
    name: '',
    event_type: 'wedding',
    event_date: '',
    event_start_at: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
    gallery_reveal_at: nextDayNineAmLocal(),
    allow_photos: true,
    allow_videos: true,
    allow_audio: true,
    require_pin: true,
    gallery_locked_message: 'The gallery is developing. Come back tomorrow.',
    gallery_unlocked_message: 'The memories are ready.',
    theme_key: 'disposable' as string,
  })

  async function saveSimpleType(type: WebsiteType) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/website/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, website_type: type }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save')
      router.push('/website')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  async function createPovEvent() {
    if (!pov.name.trim()) { setError('Please enter an event name.'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/pov/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          ...pov,
          gallery_reveal_at: new Date(pov.gallery_reveal_at).toISOString(),
          event_start_at: pov.event_start_at ? new Date(pov.event_start_at).toISOString() : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not create event')
      router.push(`/website/pov/${json.event.id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  function handleContinue() {
    if (!selected) return
    if (selected === 'pov_event') return // handled by the POV form button
    void saveSimpleType(selected)
  }

  const set = <K extends keyof typeof pov>(k: K, v: (typeof pov)[K]) =>
    setPov((p) => ({ ...p, [k]: v }))

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">What are you building?</h1>
        <p className="text-sm text-white/40 mt-1">
          Pick the type of website or app. We&apos;ll tailor the templates, pages, and tools.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Type options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {WEBSITE_TYPE_OPTIONS.map((opt) => {
          const Icon = ICONS[opt.value]
          const active = selected === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setSelected(opt.value); setError(null) }}
              className={cn(
                'text-left rounded-2xl border p-5 transition-all duration-200',
                active
                  ? 'border-gold-500/50 bg-gold-500/10 shadow-glow-gold'
                  : 'border-surface-border bg-graphite-800/60 hover:border-white/20',
              )}
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  'h-11 w-11 rounded-xl border flex items-center justify-center shrink-0',
                  active ? 'bg-gold-500/15 border-gold-500/30' : 'bg-white/5 border-white/10',
                )}>
                  <Icon className={cn('h-5 w-5', active ? 'text-gold-400' : 'text-white/50')} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{opt.label}</p>
                    {active && <Check className="h-4 w-4 text-gold-400" />}
                  </div>
                  <p className="text-xs text-white/40 leading-relaxed mt-1">{opt.description}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Continue button for non-POV types */}
      {selected && selected !== 'pov_event' && (
        <Button variant="primary" onClick={handleContinue} loading={saving}>
          Continue with {WEBSITE_TYPE_OPTIONS.find((o) => o.value === selected)?.label}
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}

      {/* POV setup form */}
      {selected === 'pov_event' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-surface-border bg-graphite-800/40 p-6 space-y-5"
        >
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Camera className="h-4 w-4 text-gold-400" /> POV Event App setup
            </h2>
            <p className="text-xs text-white/40 mt-1">
              Guests join with a phone number + PIN, drop photos / clips / audio, and the gallery
              reveals the next day.
            </p>
          </div>

          <Field label="Event name">
            <input className={inputCls} value={pov.name} maxLength={120}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Sarah & Mike's Wedding" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Event type">
              <select className={inputCls} value={pov.event_type}
                onChange={(e) => set('event_type', e.target.value)}>
                {POV_EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{POV_EVENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </Field>
            <Field label="Theme / style">
              <select className={inputCls} value={pov.theme_key}
                onChange={(e) => set('theme_key', e.target.value)}>
                {POV_THEMES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Event date">
              <input type="date" className={inputCls} value={pov.event_date}
                onChange={(e) => set('event_date', e.target.value)} />
            </Field>
            <Field label="Event start time">
              <input type="datetime-local" className={inputCls} value={pov.event_start_at}
                onChange={(e) => set('event_start_at', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Timezone">
              <select className={inputCls} value={pov.timezone}
                onChange={(e) => set('timezone', e.target.value)}>
                {[pov.timezone, ...COMMON_TZ.filter((t) => t !== pov.timezone)].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Gallery reveal time" hint="Defaults to the next day at 9:00 AM local.">
              <input type="datetime-local" className={inputCls} value={pov.gallery_reveal_at}
                onChange={(e) => set('gallery_reveal_at', e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Toggle label="Allow photos" on={pov.allow_photos} onClick={() => set('allow_photos', !pov.allow_photos)} />
            <Toggle label="Allow 15s videos" on={pov.allow_videos} onClick={() => set('allow_videos', !pov.allow_videos)} />
            <Toggle label="Allow 30s audio" on={pov.allow_audio} onClick={() => set('allow_audio', !pov.allow_audio)} />
            <Toggle label="Require guest PIN" on={pov.require_pin} onClick={() => set('require_pin', !pov.require_pin)} />
          </div>

          <Field label="Gallery locked message">
            <input className={inputCls} value={pov.gallery_locked_message} maxLength={200}
              onChange={(e) => set('gallery_locked_message', e.target.value)} />
          </Field>
          <Field label="Gallery unlocked message">
            <input className={inputCls} value={pov.gallery_unlocked_message} maxLength={200}
              onChange={(e) => set('gallery_unlocked_message', e.target.value)} />
          </Field>

          <Button variant="primary" onClick={createPovEvent} loading={saving}>
            <Camera className="h-4 w-4" /> Create POV Event App
          </Button>
        </motion.div>
      )}
    </div>
  )
}

const inputCls =
  'w-full h-10 px-3 rounded-xl bg-graphite-900 border border-surface-border text-sm text-white placeholder-white/30 focus:border-gold-500/50 focus:outline-none transition-colors'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-white/60">{label}</span>
      {hint && <span className="text-2xs text-white/30 ml-2">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-medium border transition-colors',
        on ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
           : 'bg-white/5 border-white/10 text-white/40',
      )}>
      <span className={cn('h-3.5 w-3.5 rounded-full border flex items-center justify-center',
        on ? 'border-emerald-400 bg-emerald-400/20' : 'border-white/20')}>
        {on && <Check className="h-2.5 w-2.5 text-emerald-300" />}
      </span>
      {label}
    </button>
  )
}
