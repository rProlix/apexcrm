'use client'
// components/website/WebsitesListClient.tsx
// "My Websites & Apps" — cards for every separate website/app the business owns,
// with per-site Publish, draft/published status, filters, and live-site actions.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Store, Palette, PartyPopper, Camera, Plus, ExternalLink, Pencil, Copy,
  Globe, Archive, CheckCircle2, Clock, Rocket, Sparkles, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface WebsiteWithUrl {
  id: string
  website_type: 'business' | 'creative' | 'invitational' | 'pov_event'
  source: 'builder' | 'pov_event' | 'config'
  name: string
  public_slug: string
  subdomain: string | null
  custom_domain: string | null
  is_primary_business_site: boolean
  pov_enabled: boolean
  pov_event_id: string | null
  canva_import_enabled: boolean
  status: 'draft' | 'published' | 'archived'
  published_at: string | null
  updated_at: string
  public_url: string
  edit_url: string
  preview_url: string
  live_url: string | null
  has_unpublished_changes: boolean
  canva_badge: boolean
  pov_badge: boolean
}

type FilterKey = 'all' | 'drafts' | 'published' | 'business' | 'events' | 'pov' | 'canva'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'published', label: 'Published' },
  { key: 'business', label: 'Business' },
  { key: 'events', label: 'Event Websites' },
  { key: 'pov', label: 'POV Apps' },
  { key: 'canva', label: 'Canva Imports' },
]

const TYPE_META: Record<WebsiteWithUrl['website_type'], { icon: LucideIcon; label: string }> = {
  business:     { icon: Store,       label: 'Business Website' },
  creative:     { icon: Palette,     label: 'Creative Portfolio' },
  invitational: { icon: PartyPopper, label: 'Invitation / Event Website' },
  pov_event:    { icon: Camera,      label: 'POV Event App' },
}

function absoluteUrl(rel: string): string {
  if (/^https?:\/\//.test(rel)) return rel
  if (typeof window !== 'undefined') return `${window.location.origin}${rel}`
  return rel
}

function matchesFilter(w: WebsiteWithUrl, f: FilterKey): boolean {
  switch (f) {
    case 'all': return true
    case 'drafts': return w.status !== 'published'
    case 'published': return w.status === 'published'
    case 'business': return w.website_type === 'business' || w.website_type === 'creative'
    case 'events': return w.website_type === 'invitational'
    case 'pov': return w.website_type === 'pov_event' || w.pov_badge
    case 'canva': return w.canva_badge
  }
}

export function WebsitesListClient({
  tenantId, initialWebsites, rootDomain,
}: { tenantId: string; initialWebsites: WebsiteWithUrl[]; rootDomain: string }) {
  const router = useRouter()
  const [websites, setWebsites] = useState(initialWebsites)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [domainFor, setDomainFor] = useState<WebsiteWithUrl | null>(null)

  const visible = useMemo(() => websites.filter((w) => matchesFilter(w, filter)), [websites, filter])

  async function copyUrl(w: WebsiteWithUrl) {
    try {
      await navigator.clipboard.writeText(absoluteUrl(w.live_url ?? w.public_url))
      setCopiedId(w.id)
      setTimeout(() => setCopiedId((c) => (c === w.id ? null : c)), 1800)
    } catch { /* clipboard blocked */ }
  }

  async function publish(w: WebsiteWithUrl) {
    setBusyId(w.id); setError(null); setMsg(null)
    try {
      const res = await fetch(`/api/websites/${w.id}/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error ?? 'Publish failed')
      setWebsites((list) => list.map((x) => x.id === w.id
        ? { ...x, status: 'published', published_at: j.publishedAt ?? new Date().toISOString(), has_unpublished_changes: false, live_url: x.public_url }
        : x))
      setMsg(`“${w.name}” is now live.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusyId(null) }
  }

  async function archive(w: WebsiteWithUrl) {
    if (!confirm(`Archive “${w.name}”? Its public URL will stop serving. You can restore it later.`)) return
    setBusyId(w.id); setError(null)
    try {
      const res = await fetch(`/api/website/registry/${w.id}/archive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Could not archive')
      setWebsites((list) => list.filter((x) => x.id !== w.id))
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusyId(null) }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">My Websites &amp; Apps</h1>
          <p className="text-sm text-white/40 mt-1">
            Every website and app you own — each has its own URL, publish state, and settings.
          </p>
        </div>
        <Button variant="primary" onClick={() => router.push('/website/create')}>
          <Plus className="h-4 w-4" /> New Website / App
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = websites.filter((w) => matchesFilter(w, f.key)).length
          return (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
              className={cn(
                'h-8 px-3 rounded-lg text-xs font-medium border transition-colors',
                filter === f.key
                  ? 'border-gold-500/50 bg-gold-500/10 text-gold-300'
                  : 'border-surface-border bg-graphite-800/60 text-white/50 hover:text-white/80',
              )}>
              {f.label} <span className="text-white/30">{count}</span>
            </button>
          )
        })}
      </div>

      {msg && <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300">{msg}</div>}
      {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-surface-border bg-graphite-800/40 p-10 text-center">
          <p className="text-sm text-white/50">Nothing here yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map((w) => {
            const meta = TYPE_META[w.website_type]
            const Icon = meta.icon
            const connectedDomain = w.custom_domain
              ? w.custom_domain
              : w.subdomain ? `${w.subdomain}.${rootDomain}` : null
            const published = w.status === 'published'
            return (
              <div key={w.id} className="rounded-2xl border border-surface-border bg-graphite-800/60 p-5 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-gold-400" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white truncate">{w.name}</p>
                      {w.is_primary_business_site && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-white/10 text-white/50">Primary</span>
                      )}
                      {w.canva_badge && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 inline-flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" /> Canva
                        </span>
                      )}
                      {w.pov_badge && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 inline-flex items-center gap-1">
                          <Camera className="h-2.5 w-2.5" /> POV
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40">{meta.label}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cn(
                      'inline-flex items-center gap-1 text-2xs px-2 py-1 rounded-full border',
                      published
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-white/15 bg-white/5 text-white/50',
                    )}>
                      {published ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {published ? 'Published' : 'Not Published Yet'}
                    </span>
                    {published && w.has_unpublished_changes && (
                      <span className="text-2xs px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
                        Unpublished changes
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2 text-white/60">
                    <Globe className="h-3.5 w-3.5 text-white/30 shrink-0" />
                    <span className="truncate font-mono">{w.public_url}</span>
                  </div>
                  {connectedDomain && (
                    <div className="flex items-center gap-2 text-white/40 pl-6"><span className="truncate">{connectedDomain}</span></div>
                  )}
                  <p className="text-2xs text-white/30 pl-6">
                    Updated {new Date(w.updated_at).toLocaleDateString()}
                    {w.published_at ? ` · Published ${new Date(w.published_at).toLocaleDateString()}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="secondary" size="sm" onClick={() => router.push(w.edit_url)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <a href={absoluteUrl(w.preview_url)} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /> Preview Draft</Button>
                  </a>
                  <Button variant="primary" size="sm" loading={busyId === w.id} onClick={() => publish(w)}>
                    <Rocket className="h-3.5 w-3.5" /> {published ? (w.has_unpublished_changes ? 'Publish Changes' : 'Republish') : 'Publish to Site'}
                  </Button>
                  {published && (
                    <a href={absoluteUrl(w.live_url ?? w.public_url)} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /> Open Live Site</Button>
                    </a>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => copyUrl(w)}>
                    <Copy className="h-3.5 w-3.5" /> {copiedId === w.id ? 'Copied!' : 'Copy URL'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDomainFor(w)}>
                    <Globe className="h-3.5 w-3.5" /> Manage Domain
                  </Button>
                  {!w.is_primary_business_site && (
                    <Button variant="ghost" size="sm" loading={busyId === w.id} onClick={() => archive(w)}>
                      <Archive className="h-3.5 w-3.5" /> Archive
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {domainFor && (
        <DomainModal
          tenantId={tenantId} website={domainFor} rootDomain={rootDomain}
          onClose={() => setDomainFor(null)}
          onSaved={() => { setDomainFor(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function DomainModal({
  tenantId, website, rootDomain, onClose, onSaved,
}: {
  tenantId: string; website: WebsiteWithUrl; rootDomain: string
  onClose: () => void; onSaved: () => void
}) {
  const [customDomain, setCustomDomain] = useState(website.custom_domain ?? '')
  const [subdomain, setSubdomain] = useState(website.subdomain ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/website/registry/${website.id}/domain`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, custom_domain: customDomain || null, subdomain: subdomain || null }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Could not save domain')
      onSaved()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong'); setBusy(false) }
  }

  const inputCls = 'w-full h-10 px-3 rounded-xl bg-graphite-900 border border-surface-border text-sm text-white placeholder-white/30 focus:border-gold-500/50 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-surface-border bg-graphite-800 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-white">Manage domain — {website.name}</h2>
        {err && <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">{err}</div>}
        <label className="block">
          <span className="text-xs font-medium text-white/60">Subdomain</span>
          <div className="mt-1.5 flex items-center gap-2">
            <input className={inputCls} value={subdomain} placeholder="erick-baby-shower"
              onChange={(e) => setSubdomain(e.target.value)} />
            <span className="text-xs text-white/40 whitespace-nowrap">.{rootDomain}</span>
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-white/60">Custom domain</span>
          <input className={`${inputCls} mt-1.5`} value={customDomain} placeholder="babyshower.com"
            onChange={(e) => setCustomDomain(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>Save domain</Button>
        </div>
      </div>
    </div>
  )
}
