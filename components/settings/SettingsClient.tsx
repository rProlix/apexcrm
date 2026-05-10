'use client'
// components/settings/SettingsClient.tsx
// Full-featured settings UI with tabs: General, Domain, Appearance, SEO, Team,
// Subscription, Modules, Notifications, Security, Danger Zone.

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, Globe, Palette, Search, Users, CreditCard,
  Layers, Bell, Shield, AlertTriangle, Check, Save,
  AlertCircle, ExternalLink, Copy, Link, Info, Trash2,
  Plus, ChevronRight, Mail, Phone, MapPin, Hash,
  Webhook, Eye, EyeOff, Key, LogOut, X, RefreshCw,
  Building, Tag, Zap,
} from 'lucide-react'
import NextLink from 'next/link'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import type { SiteSettings } from '@/lib/website/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TenantMember {
  id:         string
  email:      string
  role:       string
  status:     string
  created_at: string
  metadata:   Record<string, unknown>
}

interface TenantModule {
  module_key: string
  enabled:    boolean
  config:     Record<string, unknown>
}

interface Subscription {
  status:             string
  current_period_end: string | null
  stripe_customer_id: string | null
  plans: { name: string; slug: string; price_cents: number; currency: string } | null
}

interface Props {
  tenantId:        string
  tenantName:      string
  tenantSlug:      string
  tenantSubdomain: string | null
  tenantStatus:    string
  branding:        Record<string, unknown>
  modules:         TenantModule[]
  subscription:    Subscription | null
  members:         TenantMember[]
  siteSettings:    SiteSettings | null
  allDomains:      Array<{ hostname: string; verified: boolean }>
  currentUserRole: string
  currentUserId:   string
}

// ── Shared primitives ─────────────────────────────────────────────────────────

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

const inputCls =
  'w-full bg-graphite-700 border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors'
const labelCls =
  'block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5'
const sectionCls =
  'rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4'

function SectionHead({ icon: Icon, color, title, subtitle }: {
  icon: React.ElementType; color: string; title: string; subtitle?: string
}) {
  return (
    <div className="flex items-start gap-3 mb-2">
      <div className={cn('mt-0.5 h-4 w-4 shrink-0', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-white/35 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function Toggle({ value, onChange, label, description }: {
  value: boolean; onChange: (v: boolean) => void; label: string; description?: string
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-1 gap-4">
      <span className="flex-1">
        <span className="text-sm text-white/80">{label}</span>
        {description && <p className="text-xs text-white/35 mt-0.5">{description}</p>}
      </span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          'relative shrink-0 h-6 w-11 rounded-full border-2 transition-colors duration-200',
          value ? 'bg-gold-500/30 border-gold-500/60' : 'bg-white/8 border-white/15',
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full transition-transform duration-200',
          value ? 'translate-x-5 bg-gold-400' : 'translate-x-0.5 bg-white/30',
        )} />
      </button>
    </label>
  )
}

function SaveBar({ saving, saved, error, onSave, onDismiss }: {
  saving: boolean; saved: boolean; error: string | null; onSave: () => void; onDismiss: () => void
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {error && (
        <div className="flex-1 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={onDismiss} className="ml-auto text-red-400/50 hover:text-red-400">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <Button variant="primary" onClick={onSave} loading={saving}>
        {saved
          ? <><Check className="h-4 w-4" /> Saved</>
          : <><Save className="h-4 w-4" /> Save Changes</>
        }
      </Button>
    </div>
  )
}

function useSave(url: string, buildBody: () => Record<string, unknown>) {
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const save = useCallback(async () => {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch(url, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildBody()),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [url, buildBody])

  return { saving, saved, error, save, clearError: () => setError(null) }
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'general',       label: 'General',      icon: Settings     },
  { id: 'domain',        label: 'Domain',        icon: Globe        },
  { id: 'appearance',    label: 'Appearance',    icon: Palette      },
  { id: 'seo',           label: 'SEO',           icon: Search       },
  { id: 'team',          label: 'Team',          icon: Users        },
  { id: 'subscription',  label: 'Billing',       icon: CreditCard   },
  { id: 'modules',       label: 'Modules',       icon: Layers       },
  { id: 'email',         label: 'Email',         icon: Mail         },
  { id: 'notifications', label: 'Notifications', icon: Bell         },
  { id: 'security',      label: 'Security',      icon: Shield       },
  { id: 'danger',        label: 'Danger Zone',   icon: AlertTriangle},
] as const

type TabId = (typeof TABS)[number]['id']

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsClient({
  tenantId, tenantName, tenantSlug, tenantSubdomain: _tenantSubdomain, tenantStatus,
  branding, modules, subscription, members: initialMembers,
  siteSettings, allDomains: initialDomains, currentUserRole, currentUserId,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('general')

  return (
    <div className="flex flex-col gap-0 min-h-0">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-sm text-white/40 mt-0.5">Manage every aspect of your workspace</p>
      </div>

      {/* Mobile: horizontal scrollable tab strip */}
      <div className="md:hidden overflow-x-auto pb-3 -mx-4 px-4 mb-4">
        <div className="flex gap-1.5 w-max">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 border',
                activeTab === id
                  ? id === 'danger'
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-gold-500/12 text-gold-400 border-gold-500/20'
                  : id === 'danger'
                    ? 'text-red-400/60 border-surface-border bg-graphite-800 hover:text-red-400'
                    : 'text-white/50 border-surface-border bg-graphite-800 hover:text-white',
              )}
            >
              <Icon className={cn(
                'h-3.5 w-3.5 shrink-0',
                activeTab === id
                  ? id === 'danger' ? 'text-red-400' : 'text-gold-400'
                  : id === 'danger' ? 'text-red-400/50' : 'text-white/35',
              )} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-8 items-start">
        {/* Desktop-only vertical nav */}
        <nav className="hidden md:block w-48 shrink-0 space-y-0.5 sticky top-6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 text-left',
                activeTab === id
                  ? 'bg-gold-500/12 text-gold-400 border border-gold-500/20'
                  : 'text-white/50 hover:text-white hover:bg-graphite-700',
                id === 'danger' && activeTab !== 'danger' && 'hover:text-red-400 hover:bg-red-500/8',
                id === 'danger' && activeTab === 'danger' && 'bg-red-500/10 text-red-400 border border-red-500/20',
              )}
            >
              <Icon className={cn(
                'h-4 w-4 shrink-0',
                activeTab === id
                  ? id === 'danger' ? 'text-red-400' : 'text-gold-400'
                  : id === 'danger' ? 'text-red-400/50' : 'text-white/35',
              )} strokeWidth={1.75} />
              {label}
              {activeTab === id && id !== 'danger' && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold-400" />
              )}
            </button>
          ))}
        </nav>

        {/* Content pane — full width on mobile, flex-1 on desktop */}
        <div className="flex-1 min-w-0 w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'general'       && <GeneralTab       tenantId={tenantId} tenantName={tenantName} branding={branding} tenantStatus={tenantStatus} tenantSlug={tenantSlug} />}
              {activeTab === 'domain'        && <DomainTab        tenantId={tenantId} tenantSlug={tenantSlug} siteSettings={siteSettings} allDomains={initialDomains} />}
              {activeTab === 'appearance'    && <AppearanceTab    tenantId={tenantId} branding={branding} siteSettings={siteSettings} />}
              {activeTab === 'seo'           && <SeoTab           tenantId={tenantId} siteSettings={siteSettings} />}
              {activeTab === 'team'          && <TeamTab          tenantId={tenantId} initialMembers={initialMembers} currentUserId={currentUserId} currentUserRole={currentUserRole} />}
              {activeTab === 'subscription'  && <SubscriptionTab  subscription={subscription} />}
              {activeTab === 'modules'       && <ModulesTab       modules={modules} />}
              {activeTab === 'email'         && <EmailSettingsLink />}
              {activeTab === 'notifications' && <NotificationsTab />}
              {activeTab === 'security'      && <SecurityTab      />}
              {activeTab === 'danger'        && <DangerTab        tenantName={tenantName} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ── General tab ───────────────────────────────────────────────────────────────

function GeneralTab({ tenantId: _tenantId, tenantName, branding, tenantStatus, tenantSlug }: {
  tenantId: string; tenantName: string; branding: Record<string, unknown>; tenantStatus: string; tenantSlug: string
}) {
  const [name,         setName]         = useState(tenantName)
  const [industry,     setIndustry]     = useState(String(branding.industry ?? ''))
  const [tagline,      setTagline]      = useState(String(branding.tagline ?? ''))
  const [supportEmail, setSupportEmail] = useState(String(branding.support_email ?? ''))
  const [supportPhone, setSupportPhone] = useState(String(branding.support_phone ?? ''))
  const [address,      setAddress]      = useState(String(branding.address ?? ''))

  const buildBody = useCallback(() => ({
    name, industry, tagline,
    support_email: supportEmail || null,
    support_phone: supportPhone || null,
    address:       address || null,
  }), [name, industry, tagline, supportEmail, supportPhone, address])

  const { saving, saved, error, save, clearError } = useSave('/api/settings/tenant', buildBody)

  const INDUSTRIES = [
    'automotive', 'beauty', 'cleaning', 'construction', 'consulting',
    'dental', 'education', 'events', 'fitness', 'food', 'general',
    'healthcare', 'hospitality', 'legal', 'logistics', 'pet',
    'photography', 'plumbing', 'real_estate', 'retail', 'technology',
  ]

  return (
    <div className="space-y-6">
      <div className={sectionCls}>
        <SectionHead icon={Building} color="text-gold-400" title="Business Information" subtitle="Your business name and primary contact details" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="col-span-1 sm:col-span-2">
            <label className={labelCls}>Business Name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="My Business" />
          </div>
          <div>
            <label className={labelCls}>Slug (read-only)</label>
            <div className="flex items-center gap-2 bg-graphite-700/50 border border-surface-border rounded-xl px-3.5 py-2.5">
              <Hash className="h-3.5 w-3.5 text-white/25 shrink-0" />
              <span className="text-sm text-white/40 font-mono">{tenantSlug}</span>
            </div>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <div className="flex items-center gap-2 bg-graphite-700/50 border border-surface-border rounded-xl px-3.5 py-2.5">
              <span className={cn('h-2 w-2 rounded-full', tenantStatus === 'active' ? 'bg-emerald-400' : 'bg-white/30')} />
              <span className="text-sm text-white/60 capitalize">{tenantStatus}</span>
            </div>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className={labelCls}>Industry</label>
            <select
              className={cn(inputCls, 'appearance-none')}
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            >
              <option value="">Select industry…</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>{ind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className={labelCls}>Tagline</label>
            <input className={inputCls} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Quality service, every time." />
          </div>
        </div>
      </div>

      <div className={sectionCls}>
        <SectionHead icon={Phone} color="text-blue-400" title="Contact Details" subtitle="Shown on your public website and customer communications" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}><Mail className="h-3 w-3 inline mr-1" />Support Email</label>
            <input className={inputCls} type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="hello@yourbusiness.com" />
          </div>
          <div>
            <label className={labelCls}><Phone className="h-3 w-3 inline mr-1" />Support Phone</label>
            <input className={inputCls} type="tel" value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className={labelCls}><MapPin className="h-3 w-3 inline mr-1" />Address</label>
            <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, State, ZIP" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <SaveBar saving={saving} saved={saved} error={error} onSave={save} onDismiss={clearError} />
      </div>
    </div>
  )
}

// ── Domain tab ────────────────────────────────────────────────────────────────

function DomainTab({ tenantId, tenantSlug, siteSettings, allDomains: initialDomains }: {
  tenantId: string; tenantSlug: string; siteSettings: SiteSettings | null;
  allDomains: Array<{ hostname: string; verified: boolean }>
}) {
  const [domains,      setDomains]      = useState(initialDomains)
  const [newDomain,    setNewDomain]    = useState('')
  const [domainType,   setDomainType]   = useState<'subdomain' | 'custom'>(
    (siteSettings?.domain_type as 'subdomain' | 'custom') ?? 'subdomain'
  )
  const [addingDomain, setAddingDomain] = useState(false)
  const [domainError,  setDomainError]  = useState<string | null>(null)
  const [removeError,  setRemoveError]  = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)
  const [savingType,   setSavingType]   = useState(false)
  const [savedType,    setSavedType]    = useState(false)

  const subdomainUrl = `https://${tenantSlug}.${ROOT_DOMAIN}`
  const verifiedDomains = domains.filter((d) => d.verified).map((d) => d.hostname)
  const activePublicUrl = domainType === 'custom' && verifiedDomains[0]
    ? `https://${verifiedDomains[0]}`
    : subdomainUrl

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleSaveDomainType() {
    setSavingType(true)
    try {
      await fetch('/api/website/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenant_id: tenantId, domain_type: domainType }),
      })
      setSavedType(true)
      setTimeout(() => setSavedType(false), 3000)
    } finally {
      setSavingType(false)
    }
  }

  async function handleAddDomain() {
    const domain = newDomain.trim().toLowerCase().replace(/https?:\/\//, '').replace(/\/$/, '')
    if (!domain) return
    setAddingDomain(true); setDomainError(null)
    try {
      const res  = await fetch('/api/website/domain', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenant_id: tenantId, hostname: domain }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to add domain')
      setDomains((prev) => [...prev, { hostname: domain, verified: false }])
      setNewDomain('')
    } catch (e) {
      setDomainError(e instanceof Error ? e.message : 'Failed to add domain')
    } finally {
      setAddingDomain(false)
    }
  }

  async function handleRemoveDomain(hostname: string) {
    setRemoveError(null)
    try {
      const res = await fetch('/api/website/domain', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenant_id: tenantId, hostname }),
      })
      if (!res.ok) throw new Error('Failed to remove domain')
      setDomains((prev) => prev.filter((d) => d.hostname !== hostname))
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Failed to remove domain')
    }
  }

  return (
    <div className="space-y-6">
      {/* Platform subdomain */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-1">
          <SectionHead icon={Link} color="text-blue-400" title="Platform Subdomain" />
          <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-full px-2 py-0.5 font-medium">
            Always active
          </span>
        </div>
        <p className="text-xs text-white/40">Your site is always reachable at this address, even without a custom domain.</p>

        <div className="flex items-center gap-2 bg-graphite-700/60 border border-surface-border rounded-xl px-4 py-3">
          <Globe className="h-4 w-4 text-blue-400 shrink-0" />
          <span className="flex-1 text-sm text-white font-mono">{subdomainUrl}</span>
          <button onClick={() => copyToClipboard(subdomainUrl)} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <a href={subdomainUrl} target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-blue-400 transition-colors">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Active domain selection */}
      <div className={sectionCls}>
        <SectionHead icon={Globe} color="text-gold-400" title="Active Domain" subtitle="Choose which domain powers your public website" />

        <div className="grid grid-cols-2 gap-3">
          {(['subdomain', 'custom'] as const).map((type) => {
            const isDisabled = type === 'custom' && verifiedDomains.length === 0
            return (
              <button
                key={type}
                onClick={() => !isDisabled && setDomainType(type)}
                disabled={isDisabled}
                className={cn(
                  'rounded-xl border p-4 text-left transition-all',
                  domainType === type
                    ? 'border-gold-500/60 bg-gold-500/8'
                    : 'border-surface-border bg-graphite-700/40 hover:border-white/20',
                  isDisabled && 'opacity-40 cursor-not-allowed',
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn('h-3.5 w-3.5 rounded-full border-2 transition-colors', domainType === type ? 'border-gold-400 bg-gold-400' : 'border-white/20')} />
                  <span className="text-sm font-medium text-white capitalize">{type === 'subdomain' ? 'Subdomain' : 'Custom Domain'}</span>
                </div>
                <p className="text-xs text-white/40 ml-5">
                  {type === 'subdomain'
                    ? `${tenantSlug}.${ROOT_DOMAIN}`
                    : verifiedDomains[0] ?? 'No verified domain yet'}
                </p>
              </button>
            )
          })}
        </div>

        <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-4 py-3 flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-emerald-400 font-semibold mb-0.5">Active public URL</p>
            <p className="text-xs text-emerald-300/70 truncate font-mono">{activePublicUrl}</p>
          </div>
          <a href={activePublicUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400/60 hover:text-emerald-400 shrink-0">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={handleSaveDomainType} loading={savingType}>
            {savedType ? <><Check className="h-3.5 w-3.5" /> Saved</> : <><Save className="h-3.5 w-3.5" /> Save</>}
          </Button>
        </div>
      </div>

      {/* Custom domain management */}
      <div className={sectionCls}>
        <SectionHead icon={Shield} color="text-violet-400" title="Custom Domains" subtitle="Register and manage custom domains for your site" />

        {domains.length > 0 && (
          <div className="space-y-2">
            {domains.map((d) => (
              <div key={d.hostname} className="flex items-center gap-3 bg-graphite-700/40 rounded-xl px-4 py-2.5 border border-surface-border">
                <Globe className="h-3.5 w-3.5 text-white/30 shrink-0" />
                <span className="flex-1 text-sm text-white font-mono">{d.hostname}</span>
                {d.verified
                  ? <span className="text-xs text-emerald-400 flex items-center gap-1"><Check className="h-3 w-3" /> Verified</span>
                  : <span className="text-xs text-amber-400/80 flex items-center gap-1"><Info className="h-3 w-3" /> Pending DNS</span>
                }
                <button onClick={() => handleRemoveDomain(d.hostname)} className="text-white/20 hover:text-red-400 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            className={cn(inputCls, 'flex-1')}
            placeholder="www.yourdomain.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value.replace(/https?:\/\//, '').toLowerCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
          />
          <Button variant="secondary" onClick={handleAddDomain} loading={addingDomain}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        {domainError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {domainError}</p>
        )}
        {removeError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {removeError}</p>
        )}

        {/* DNS instructions */}
        <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-300 flex items-center gap-2">
            <Info className="h-3.5 w-3.5" /> DNS Setup Instructions
          </p>
          <p className="text-xs text-white/50">
            Add the following DNS record at your domain registrar to point your domain to this platform:
          </p>
          <div className="rounded-lg bg-graphite-900/60 border border-white/8 p-3 font-mono text-xs space-y-1.5">
            {[['Type', 'CNAME', 'text-amber-300'], ['Name', '@ or www', 'text-white'], ['Value', 'cname.vercel-dns.com', 'text-emerald-300'], ['TTL', '3600', 'text-white']].map(([key, val, cls]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-white/30 w-12">{key}</span>
                <span className={cls}>{val}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/30">DNS propagation can take up to 48 hours after saving.</p>
        </div>
      </div>
    </div>
  )
}

// ── Appearance tab ────────────────────────────────────────────────────────────

function AppearanceTab({ tenantId, branding, siteSettings }: {
  tenantId: string; branding: Record<string, unknown>; siteSettings: SiteSettings | null
}) {
  const [logoUrl,      setLogoUrl]      = useState(String(branding.logo_url ?? ''))
  const [faviconUrl,   setFaviconUrl]   = useState(String(branding.favicon_url ?? ''))
  const [primaryColor, setPrimaryColor] = useState(String(branding.primary_color ?? '#c9a84c'))
  const [accentColor,  setAccentColor]  = useState(String((branding as Record<string,string>).accent_color ?? '#a07830'))
  const [siteName,     setSiteName]     = useState(siteSettings?.site_name ?? '')

  const buildBrandingBody = useCallback(() => ({
    logo_url:      logoUrl || null,
    favicon_url:   faviconUrl || null,
    primary_color: primaryColor,
    accent_color:  accentColor,
  }), [logoUrl, faviconUrl, primaryColor, accentColor])

  const { saving: bSaving, saved: bSaved, error: bError, save: bSave, clearError: bClear } = useSave('/api/settings/tenant', buildBrandingBody)

  const buildSiteBody = useCallback(() => ({
    tenant_id: tenantId,
    site_name: siteName || null,
    logo_url:  logoUrl || null,
  }), [tenantId, siteName, logoUrl])

  const { saving: sSaving, saved: sSaved, error: sError, save: sSave, clearError: sClear } = useSave('/api/website/settings', buildSiteBody)

  async function handleSave() {
    await Promise.all([bSave(), sSave()])
  }

  const saving = bSaving || sSaving
  const saved  = bSaved  && sSaved
  const error  = bError  ?? sError

  const PRESETS = [
    { label: 'Gold',    primary: '#c9a84c', accent: '#a07830' },
    { label: 'Blue',    primary: '#3b82f6', accent: '#1d4ed8' },
    { label: 'Emerald', primary: '#10b981', accent: '#059669' },
    { label: 'Violet',  primary: '#8b5cf6', accent: '#6d28d9' },
    { label: 'Rose',    primary: '#f43f5e', accent: '#e11d48' },
    { label: 'Orange',  primary: '#f97316', accent: '#ea580c' },
  ]

  return (
    <div className="space-y-6">
      <div className={sectionCls}>
        <SectionHead icon={Palette} color="text-gold-400" title="Brand Identity" subtitle="Logo, favicon, and site name" />

        <div>
          <label className={labelCls}>Site Name</label>
          <input className={inputCls} value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="My Business" />
          <p className="text-xs text-white/30 mt-1">Shown in the browser tab and throughout your site.</p>
        </div>
        <div>
          <label className={labelCls}>Logo URL</label>
          <input className={inputCls} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://cdn.example.com/logo.png" />
          {logoUrl && (
            <div className="mt-3 h-14 w-32 rounded-xl bg-graphite-700/50 border border-surface-border flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo preview" className="max-h-10 max-w-28 object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>Favicon URL</label>
          <input className={inputCls} value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://cdn.example.com/favicon.ico" />
          {faviconUrl && (
            <div className="mt-3 h-8 w-8 rounded-lg bg-graphite-700/50 border border-surface-border flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={faviconUrl} alt="Favicon preview" className="h-5 w-5 object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
            </div>
          )}
        </div>
      </div>

      <div className={sectionCls}>
        <SectionHead icon={Palette} color="text-violet-400" title="Brand Colors" subtitle="Primary and accent colors used across your site" />

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={labelCls}>Primary Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-14 rounded-lg border border-surface-border bg-graphite-700 cursor-pointer p-1" />
              <input className={cn(inputCls, 'flex-1 font-mono text-xs')} value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#c9a84c" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Accent Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-14 rounded-lg border border-surface-border bg-graphite-700 cursor-pointer p-1" />
              <input className={cn(inputCls, 'flex-1 font-mono text-xs')} value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#a07830" />
            </div>
          </div>
        </div>

        <div>
          <label className={labelCls}>Color Presets</label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => { setPrimaryColor(p.primary); setAccentColor(p.accent) }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-surface-border bg-graphite-700/50 hover:border-white/20 transition-colors text-xs text-white/70"
              >
                <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: p.primary }} />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview strip */}
        <div className="rounded-xl border border-surface-border overflow-hidden">
          <div className="px-4 py-2 flex items-center gap-3" style={{ backgroundColor: primaryColor + '22', borderBottom: `1px solid ${primaryColor}33` }}>
            <div className="h-5 w-5 rounded-md flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: primaryColor }}>A</div>
            <span className="text-xs font-semibold" style={{ color: primaryColor }}>Brand preview</span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: accentColor }}>Badge</span>
          </div>
          <div className="px-4 py-3 bg-graphite-900/80">
            <p className="text-xs text-white/50">Background content with <span style={{ color: primaryColor }}>primary link</span> and <span style={{ color: accentColor }}>accent text</span>.</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} onDismiss={() => { bClear(); sClear() }} />
      </div>
    </div>
  )
}

// ── SEO tab ───────────────────────────────────────────────────────────────────

function SeoTab({ tenantId, siteSettings }: { tenantId: string; siteSettings: SiteSettings | null }) {
  const seoDefaults = (siteSettings?.seo_defaults as Record<string, string> | null) ?? {}

  const [title,    setTitle]    = useState(seoDefaults.title ?? '')
  const [desc,     setDesc]     = useState(seoDefaults.description ?? '')
  const [ogImage,  setOgImage]  = useState(seoDefaults.ogImage ?? '')
  const [twitter,  setTwitter]  = useState(seoDefaults.twitterHandle ?? '')
  const [robots,   setRobots]   = useState(seoDefaults.robots ?? 'index, follow')
  const [canonical,setCanonical]= useState(seoDefaults.canonical ?? '')

  const buildBody = useCallback(() => ({
    tenant_id: tenantId,
    seo_defaults: {
      title:         title.trim() || null,
      description:   desc.trim() || null,
      ogImage:       ogImage.trim() || null,
      twitterHandle: twitter.trim() || null,
      robots:        robots.trim() || null,
      canonical:     canonical.trim() || null,
    },
  }), [tenantId, title, desc, ogImage, twitter, robots, canonical])

  const { saving, saved, error, save, clearError } = useSave('/api/website/settings', buildBody)

  const ROBOTS_OPTIONS = ['index, follow', 'noindex, follow', 'index, nofollow', 'noindex, nofollow']

  return (
    <div className="space-y-6">
      <div className={sectionCls}>
        <SectionHead icon={Search} color="text-violet-400" title="Search Engine Optimization" subtitle="Default values — individual pages can override these" />

        <div>
          <label className={labelCls}>Default Page Title</label>
          <input className={inputCls} placeholder="My Business — {{page}}" value={title} onChange={(e) => setTitle(e.target.value)} />
          <p className="text-xs text-white/30 mt-1">Use {'{{page}}'} as a placeholder for the current page name.</p>
        </div>
        <div>
          <label className={labelCls}>Default Meta Description</label>
          <textarea
            className={cn(inputCls, 'resize-none h-20')}
            placeholder="A concise description of your business for search engines. Keep it under 160 characters."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <p className={cn('text-xs mt-1', desc.length > 160 ? 'text-red-400' : 'text-white/30')}>
            {desc.length} / 160 characters
          </p>
        </div>
        <div>
          <label className={labelCls}>Default OG Image URL</label>
          <input className={inputCls} placeholder="https://cdn.example.com/og-image.png" value={ogImage} onChange={(e) => setOgImage(e.target.value)} />
          <p className="text-xs text-white/30 mt-1">Shown when your site is shared on social media. Recommended: 1200×630px.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Twitter / X Handle</label>
            <input className={inputCls} placeholder="@mybusiness" value={twitter} onChange={(e) => setTwitter(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Robots Directive</label>
            <select className={cn(inputCls, 'appearance-none')} value={robots} onChange={(e) => setRobots(e.target.value)}>
              {ROBOTS_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Canonical URL Override</label>
          <input className={inputCls} placeholder="https://www.yourdomain.com" value={canonical} onChange={(e) => setCanonical(e.target.value)} />
          <p className="text-xs text-white/30 mt-1">Leave blank to use the active domain automatically.</p>
        </div>
      </div>

      {/* Preview card */}
      <div className={sectionCls}>
        <SectionHead icon={Search} color="text-blue-400" title="Search Preview" subtitle="Approximate how your homepage looks in Google" />
        <div className="rounded-xl bg-white p-4 space-y-1">
          <p className="text-xs text-[#1a0dab] font-medium truncate">{title || 'Page Title Goes Here'}</p>
          <p className="text-xs text-[#006621] font-mono">https://{tenantId.slice(0, 6)}... › home</p>
          <p className="text-xs text-[#545454] leading-relaxed line-clamp-2">{desc || 'Your meta description will appear here. Write a compelling summary to increase click-through rates from search results.'}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <SaveBar saving={saving} saved={saved} error={error} onSave={save} onDismiss={clearError} />
      </div>
    </div>
  )
}

// ── Team tab ──────────────────────────────────────────────────────────────────

function TeamTab({ tenantId: _tenantId, initialMembers, currentUserId, currentUserRole }: {
  tenantId: string; initialMembers: TenantMember[]; currentUserId: string; currentUserRole: string
}) {
  // Belt-and-suspenders: filter owners even if somehow they appear in server props
  const [members,     setMembers]     = useState(initialMembers.filter((m) => m.role !== 'owner'))
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState<'admin' | 'staff'>('staff')
  const [inviting,    setInviting]    = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [removing,    setRemoving]    = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const canManage = ['owner', 'admin'].includes(currentUserRole)

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true); setInviteError(null)
    try {
      const res  = await fetch('/api/settings/team', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to invite')
      // Only add non-owner members to the list (owner invite is blocked by API)
      if (json.member?.role !== 'owner') {
        setMembers((prev) => [...prev, json.member])
      }
      setInviteEmail('')
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(userId: string) {
    setRemoving(userId); setRemoveError(null)
    try {
      const res = await fetch('/api/settings/team', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ user_id: userId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to remove')
      setMembers((prev) => prev.filter((m) => m.id !== userId))
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Remove failed')
    } finally {
      setRemoving(null)
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    // Hard block: owner role can never be assigned from the team settings UI
    if (role === 'owner') return
    await fetch('/api/settings/team', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_id: userId, role }),
    })
    setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, role } : m))
  }

  const ROLE_COLORS: Record<string, string> = {
    owner: 'bg-gold-500/15 text-gold-400 border-gold-500/25',
    admin: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    staff: 'bg-white/8 text-white/50 border-white/10',
    invited: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  }

  return (
    <div className="space-y-6">
      <div className={sectionCls}>
        <SectionHead icon={Users} color="text-blue-400" title="Team Members" subtitle={`${members.length} member${members.length !== 1 ? 's' : ''} in your workspace`} />

        <div className="space-y-2">
          {members.filter((m) => m.role !== 'owner').map((m) => (
            <div key={m.id} className="flex items-center gap-3 bg-graphite-700/40 rounded-xl px-4 py-3 border border-surface-border">
              <div className="h-8 w-8 rounded-full bg-gold-500/15 border border-gold-500/25 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-gold-400">{m.email[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{m.email}</p>
                <p className="text-xs text-white/35">Joined {formatDate(m.created_at)}</p>
              </div>

              {m.status === 'invited' && (
                <span className="text-xs text-amber-400 bg-amber-500/15 border border-amber-500/25 rounded-full px-2 py-0.5">Invited</span>
              )}

              {/* Role badge / selector — owner role option is intentionally absent */}
              {canManage && m.id !== currentUserId ? (
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  className="text-xs bg-graphite-700 border border-surface-border rounded-lg px-2 py-1 text-white/70 focus:outline-none focus:border-gold-500/50"
                >
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                </select>
              ) : (
                <span className={cn('text-xs border rounded-full px-2 py-0.5 capitalize', ROLE_COLORS[m.role] ?? ROLE_COLORS.staff)}>
                  {m.id === currentUserId ? `${m.role} (you)` : m.role}
                </span>
              )}

              {canManage && m.id !== currentUserId && (
                <button
                  onClick={() => handleRemove(m.id)}
                  disabled={removing === m.id}
                  className="text-white/20 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  {removing === m.id
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />
                  }
                </button>
              )}
            </div>
          ))}
        </div>

        {removeError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {removeError}</p>
        )}
      </div>

      {canManage && (
        <div className={sectionCls}>
          <SectionHead icon={Plus} color="text-emerald-400" title="Invite Team Member" subtitle="New members receive an email with login instructions" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Email Address</label>
              <input
                className={inputCls}
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              />
            </div>
            <div>
              <label className={labelCls}>Role</label>
              <select
                className={cn(inputCls, 'appearance-none')}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'staff')}
              >
                <option value="staff">Staff — View and manage records</option>
                <option value="admin">Admin — Full settings access</option>
              </select>
            </div>
          </div>

          {inviteError && (
            <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {inviteError}</p>
          )}

          <div className="flex justify-end">
            <Button variant="primary" onClick={handleInvite} loading={inviting}>
              <Mail className="h-4 w-4" /> Send Invite
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subscription tab ──────────────────────────────────────────────────────────

function SubscriptionTab({ subscription }: { subscription: Subscription | null }) {
  const plan = subscription?.plans
  const PLAN_FEATURES: Record<string, string[]> = {
    starter:  ['Up to 3 team members', '1 custom domain', 'Core CRM modules', 'Email support'],
    pro:      ['Up to 10 team members', '3 custom domains', 'All modules', 'Priority support', 'Advanced analytics'],
    business: ['Unlimited team members', 'Unlimited domains', 'All modules', 'Dedicated support', 'White-label', 'API access'],
  }
  const features = PLAN_FEATURES[plan?.slug ?? ''] ?? []

  return (
    <div className="space-y-6">
      <div className={sectionCls}>
        <SectionHead icon={CreditCard} color="text-gold-400" title="Current Plan" subtitle="Your subscription and billing information" />

        {subscription ? (
          <>
            <div className="rounded-xl bg-gold-500/8 border border-gold-500/20 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-lg font-bold text-white">{plan?.name ?? 'Unknown Plan'}</p>
                  <p className="text-sm text-white/40">
                    {plan?.price_cents
                      ? `$${(plan.price_cents / 100).toFixed(2)} / month`
                      : 'Custom pricing'}
                  </p>
                </div>
                <span className={cn(
                  'text-xs border rounded-full px-2.5 py-1 font-semibold capitalize',
                  subscription.status === 'active' || subscription.status === 'trialing'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                    : 'bg-red-500/15 text-red-400 border-red-500/25',
                )}>
                  {subscription.status}
                </span>
              </div>

              {features.length > 0 && (
                <div className="space-y-1.5">
                  {features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs text-white/60">
                      <Check className="h-3.5 w-3.5 text-gold-400 shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <dl className="space-y-3">
              {subscription.current_period_end && (
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <dt className="text-xs text-white/35 uppercase tracking-wider">Renews</dt>
                  <dd className="text-sm text-white/70">{formatDate(subscription.current_period_end)}</dd>
                </div>
              )}
              {subscription.stripe_customer_id && (
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <dt className="text-xs text-white/35 uppercase tracking-wider">Stripe Customer</dt>
                  <dd className="text-sm text-white/50 font-mono">{subscription.stripe_customer_id}</dd>
                </div>
              )}
            </dl>

            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => window.open('https://billing.stripe.com/p/login', '_blank')}>
                <CreditCard className="h-3.5 w-3.5" /> Manage Billing
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.open('https://billing.stripe.com/p/login', '_blank')}>
                View Invoices <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <CreditCard className="h-10 w-10 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/40 mb-4">No active subscription found.</p>
            <Button variant="primary" size="sm">
              <Zap className="h-4 w-4" /> Upgrade Plan
            </Button>
          </div>
        )}
      </div>

      <div className={sectionCls}>
        <SectionHead icon={Tag} color="text-blue-400" title="Available Plans" subtitle="Compare and upgrade your plan" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: 'Starter', slug: 'starter', price: '$29', desc: 'Perfect for small teams' },
            { name: 'Pro',     slug: 'pro',     price: '$79', desc: 'For growing businesses' },
            { name: 'Business',slug: 'business',price: '$199',desc: 'Enterprise-grade features' },
          ].map((p) => {
            const isCurrent = plan?.slug === p.slug
            return (
              <div key={p.slug} className={cn(
                'rounded-xl border p-4 text-center',
                isCurrent ? 'border-gold-500/40 bg-gold-500/8' : 'border-surface-border bg-graphite-700/30',
              )}>
                <p className="text-sm font-semibold text-white mb-0.5">{p.name}</p>
                <p className="text-xl font-bold text-white mb-1">{p.price}<span className="text-xs text-white/35 font-normal">/mo</span></p>
                <p className="text-xs text-white/40 mb-3">{p.desc}</p>
                {isCurrent
                  ? <span className="text-xs text-gold-400 font-semibold">Current Plan</span>
                  : <Button variant="secondary" size="sm" className="w-full">Select</Button>
                }
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Modules tab ───────────────────────────────────────────────────────────────

const MODULE_DESCRIPTIONS: Record<string, string> = {
  payments:     'Accept payments, track invoices, and manage transactions',
  appointments: 'Schedule and manage appointments and service bookings',
  rewards:      'Loyalty program with points and customer rewards',
  vehicles:     'Vehicle inventory, tracking, and fleet management',
  damage_ai:    'AI-powered vehicle damage assessment and reporting',
  leads:        'Lead pipeline, follow-up tracking, and conversion management',
  messages:     'In-app messaging and customer communication hub',
  contacts:     'Full contact management and CRM address book',
  website:      'Website builder with pages, sections, and publishing',
  store:        'E-commerce store with products, orders, and checkout',
}

const MODULE_ICONS_MAP: Record<string, React.ElementType> = {
  payments:     CreditCard,
  appointments: Bell,
  rewards:      Zap,
  vehicles:     Globe,
  damage_ai:    Search,
  leads:        ChevronRight,
  messages:     Mail,
  contacts:     Users,
  website:      Globe,
  store:        Tag,
}

function ModulesTab({ modules }: { modules: TenantModule[] }) {
  const [moduleStates, setModuleStates] = useState(
    Object.fromEntries(modules.map((m) => [m.module_key, m.enabled]))
  )
  const [saving, setSaving] = useState<string | null>(null)
  const [error,  setError]  = useState<string | null>(null)

  async function handleToggle(key: string, enabled: boolean) {
    setSaving(key); setError(null)
    try {
      const res  = await fetch('/api/admin/toggle-module', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ module_key: key, enabled }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to update module')
      setModuleStates((prev) => ({ ...prev, [key]: enabled }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className={sectionCls}>
        <SectionHead icon={Layers} color="text-blue-400" title="Module Management" subtitle="Enable or disable features for your workspace. Contact support to unlock additional modules." />

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="space-y-2">
          {modules.map((mod) => {
            const Icon = MODULE_ICONS_MAP[mod.module_key] ?? Layers
            const enabled = moduleStates[mod.module_key] ?? mod.enabled
            return (
              <div key={mod.module_key}
                className="flex items-center gap-4 bg-graphite-700/40 rounded-xl px-4 py-3.5 border border-surface-border">
                <div className={cn(
                  'h-9 w-9 rounded-xl flex items-center justify-center shrink-0',
                  enabled ? 'bg-gold-500/15 border border-gold-500/25' : 'bg-white/5 border border-white/10',
                )}>
                  <Icon className={cn('h-4 w-4', enabled ? 'text-gold-400' : 'text-white/30')} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white capitalize">
                    {mod.module_key.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-white/35 truncate">
                    {MODULE_DESCRIPTIONS[mod.module_key] ?? 'Module feature'}
                  </p>
                </div>
                {saving === mod.module_key ? (
                  <RefreshCw className="h-4 w-4 text-white/30 animate-spin" />
                ) : (
                  <Toggle
                    value={enabled}
                    onChange={(v) => handleToggle(mod.module_key, v)}
                    label=""
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Notifications tab ─────────────────────────────────────────────────────────

// ── Email Settings Link Tab ───────────────────────────────────────────────────

function EmailSettingsLink() {
  const cards = [
    {
      icon:  Mail,
      title: 'Email Provider',
      desc:  'Configure Resend or Amazon SES, verify your sender domain, and run health checks.',
    },
    {
      icon:  Zap,
      title: 'White-Label Branding',
      desc:  'Emails sent to your customers show your business name, logo, and colors — not Nexora.',
    },
    {
      icon:  Bell,
      title: 'Delivery Diagnostics',
      desc:  'Send test emails, view recent delivery logs, and debug delivery failures.',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white mb-1">Email Settings</h2>
        <p className="text-sm text-white/50">
          Manage transactional email delivery, branding, and diagnostics for your business.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="rounded-xl border border-surface-border bg-graphite-800/60 p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gold-500/10 border border-gold-500/20 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
              </div>
              <p className="text-sm font-semibold text-white">{title}</p>
            </div>
            <p className="text-xs text-white/45 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <NextLink
        href="/settings/email"
        className={cn(
          'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold',
          'bg-gold-500/12 text-gold-400 border border-gold-500/20',
          'hover:bg-gold-500/20 transition-colors',
        )}
      >
        <Mail className="h-4 w-4" strokeWidth={1.75} />
        Open Email Settings
        <ChevronRight className="h-3.5 w-3.5 opacity-60" />
      </NextLink>
    </div>
  )
}

// ── Notifications Tab ─────────────────────────────────────────────────────────

function NotificationsTab() {
  const [emailNewOrder,    setEmailNewOrder]    = useState(true)
  const [emailNewLead,     setEmailNewLead]     = useState(true)
  const [emailNewCustomer, setEmailNewCustomer] = useState(false)
  const [emailAppointment, setEmailAppointment] = useState(true)
  const [emailPayment,     setEmailPayment]     = useState(true)
  const [emailWeekly,      setEmailWeekly]      = useState(true)
  const [webhookUrl,       setWebhookUrl]       = useState('')
  const [webhookNewOrder,  setWebhookNewOrder]  = useState(false)
  const [webhookNewLead,   setWebhookNewLead]   = useState(false)
  useEffect(() => {
    fetch('/api/settings/notifications')
      .then((r) => r.json())
      .then(({ notifications: n }) => {
        if (!n) return
        setEmailNewOrder(n.email_new_order       ?? true)
        setEmailNewLead(n.email_new_lead         ?? true)
        setEmailNewCustomer(n.email_new_customer ?? false)
        setEmailAppointment(n.email_appointment  ?? true)
        setEmailPayment(n.email_payment          ?? true)
        setEmailWeekly(n.email_weekly_digest     ?? true)
        setWebhookUrl(n.webhook_url              ?? '')
        setWebhookNewOrder(n.webhook_new_order   ?? false)
        setWebhookNewLead(n.webhook_new_lead     ?? false)
      })
      .catch(() => {/* keep defaults on error */})
  }, [])

  const buildBody = useCallback(() => ({
    email_new_order:     emailNewOrder,
    email_new_lead:      emailNewLead,
    email_new_customer:  emailNewCustomer,
    email_appointment:   emailAppointment,
    email_payment:       emailPayment,
    email_weekly_digest: emailWeekly,
    webhook_url:         webhookUrl || null,
    webhook_new_order:   webhookNewOrder,
    webhook_new_lead:    webhookNewLead,
  }), [emailNewOrder, emailNewLead, emailNewCustomer, emailAppointment, emailPayment, emailWeekly, webhookUrl, webhookNewOrder, webhookNewLead])

  const { saving, saved, error, save, clearError } = useSave('/api/settings/notifications', buildBody)

  return (
    <div className="space-y-6">
      <div className={sectionCls}>
        <SectionHead icon={Mail} color="text-blue-400" title="Email Notifications" subtitle="Receive email alerts for important events in your CRM" />
        <div className="space-y-1 divide-y divide-white/5">
          <Toggle value={emailNewOrder}    onChange={setEmailNewOrder}    label="New order received"       description="Alert when a customer places an order" />
          <Toggle value={emailNewLead}     onChange={setEmailNewLead}     label="New lead captured"        description="Alert when a new lead enters your pipeline" />
          <Toggle value={emailNewCustomer} onChange={setEmailNewCustomer} label="New customer signup"      description="Alert when a customer creates an account" />
          <Toggle value={emailAppointment} onChange={setEmailAppointment} label="Appointment reminder"     description="24-hour reminder for upcoming appointments" />
          <Toggle value={emailPayment}     onChange={setEmailPayment}     label="Payment received"         description="Alert when a payment is processed successfully" />
          <Toggle value={emailWeekly}      onChange={setEmailWeekly}      label="Weekly digest report"     description="Summary of your CRM activity every Monday" />
        </div>
      </div>

      <div className={sectionCls}>
        <SectionHead icon={Webhook} color="text-violet-400" title="Webhooks" subtitle="Send event data to your own server or third-party tools" />
        <div>
          <label className={labelCls}>Webhook Endpoint URL</label>
          <input className={inputCls} type="url" placeholder="https://hooks.yourserver.com/crm" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
          <p className="text-xs text-white/30 mt-1">We'll send a POST request with event data as JSON.</p>
        </div>
        <div className="space-y-1 divide-y divide-white/5">
          <Toggle value={webhookNewOrder} onChange={setWebhookNewOrder} label="Trigger on new order"  description="POST to endpoint when an order is created" />
          <Toggle value={webhookNewLead}  onChange={setWebhookNewLead}  label="Trigger on new lead"   description="POST to endpoint when a lead is captured" />
        </div>

        {webhookUrl && (
          <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-4 space-y-2">
            <p className="text-xs font-semibold text-blue-300 flex items-center gap-2">
              <Info className="h-3.5 w-3.5" /> Webhook Payload Example
            </p>
            <pre className="text-xs text-white/60 font-mono bg-graphite-900/60 rounded-lg p-3 overflow-x-auto">{`{
  "event": "order.created",
  "tenant_id": "...",
  "timestamp": "2026-01-01T00:00:00Z",
  "data": { "id": "...", "total": 4990 }
}`}</pre>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <SaveBar saving={saving} saved={saved} error={error} onSave={save} onDismiss={clearError} />
      </div>
    </div>
  )
}

// ── Security tab ──────────────────────────────────────────────────────────────

function SecurityTab() {
  const [currentPwd,  setCurrentPwd]  = useState('')
  const [newPwd,      setNewPwd]      = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew,     setShowNew]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [pwdError,    setPwdError]    = useState<string | null>(null)

  async function handleChangePassword() {
    if (!currentPwd || !newPwd || !confirmPwd) {
      setPwdError('All fields are required'); return
    }
    if (newPwd !== confirmPwd) {
      setPwdError('New passwords do not match'); return
    }
    if (newPwd.length < 8) {
      setPwdError('Password must be at least 8 characters'); return
    }
    setSaving(true); setPwdError(null)
    try {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase/client')
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser({ password: newPwd })
      if (error) throw new Error(error.message)
      setSaved(true)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setPwdError(e instanceof Error ? e.message : 'Password change failed')
    } finally {
      setSaving(false)
    }
  }

  const strength = newPwd.length === 0 ? 0
    : newPwd.length < 8  ? 1
    : newPwd.length < 12 ? 2
    : /[A-Z]/.test(newPwd) && /[0-9]/.test(newPwd) && /[^a-zA-Z0-9]/.test(newPwd) ? 4 : 3

  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const strengthColors = ['', 'bg-red-400', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-400']

  return (
    <div className="space-y-6">
      <div className={sectionCls}>
        <SectionHead icon={Key} color="text-gold-400" title="Change Password" subtitle="Use a strong, unique password for your account" />

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Current Password</label>
            <div className="relative">
              <input
                className={cn(inputCls, 'pr-10')}
                type={showCurrent ? 'text' : 'password'}
                placeholder="••••••••"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>New Password</label>
            <div className="relative">
              <input
                className={cn(inputCls, 'pr-10')}
                type={showNew ? 'text' : 'password'}
                placeholder="••••••••"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
              <button type="button" onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPwd && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i <= strength ? strengthColors[strength] : 'bg-white/10')} />
                  ))}
                </div>
                <p className={cn('text-xs', strengthColors[strength].replace('bg-', 'text-'))}>{strengthLabels[strength]}</p>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Confirm New Password</label>
            <input
              className={cn(inputCls, confirmPwd && newPwd !== confirmPwd && 'border-red-500/50 focus:border-red-500/70')}
              type="password"
              placeholder="••••••••"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
            />
            {confirmPwd && newPwd !== confirmPwd && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
            )}
          </div>

          {pwdError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" /> {pwdError}
            </div>
          )}

          <Button variant="primary" onClick={handleChangePassword} loading={saving}>
            {saved ? <><Check className="h-4 w-4" /> Password Updated</> : 'Update Password'}
          </Button>
        </div>
      </div>

      <div className={sectionCls}>
        <SectionHead icon={Shield} color="text-emerald-400" title="Active Sessions" subtitle="Your current and recent login sessions" />
        <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Shield className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-white/80">Current session</p>
            <p className="text-xs text-white/35">Active now · This device</p>
          </div>
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <Button variant="danger" size="sm" onClick={() => window.location.href = '/logout'}>
          <LogOut className="h-3.5 w-3.5" /> Sign Out All Sessions
        </Button>
      </div>

      <div className={sectionCls}>
        <SectionHead icon={Key} color="text-violet-400" title="API Access" subtitle="Use your tenant ID to authenticate API requests" />
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Tenant ID</label>
            <div className="flex items-center gap-2 bg-graphite-700/60 border border-surface-border rounded-xl px-4 py-2.5">
              <span className="flex-1 text-sm text-white/50 font-mono text-xs">Your tenant ID is shown in the URL and API responses</span>
            </div>
          </div>
          <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-4">
            <p className="text-xs text-blue-300 font-semibold mb-2 flex items-center gap-2"><Info className="h-3.5 w-3.5" /> API Authentication</p>
            <p className="text-xs text-white/50">
              All API requests require a valid session cookie or Bearer token from Supabase Auth.
              Use the service role key only from your server — never expose it in client code.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Danger Zone tab ───────────────────────────────────────────────────────────

function DangerTab({ tenantName }: { tenantName: string }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput,       setDeleteInput]       = useState('')
  const [deleting,          setDeleting]          = useState(false)

  const canDelete = deleteInput.trim() === tenantName.trim()

  async function handleDelete() {
    if (!canDelete) return
    setDeleting(true)
    // Placeholder — actual deletion would require a dedicated API route with extra verification
    await new Promise((r) => setTimeout(r, 2000))
    setDeleting(false)
    alert('Workspace deletion would be processed here. Contact support to complete this action.')
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 space-y-4">
        <SectionHead icon={AlertTriangle} color="text-red-400" title="Export Data" subtitle="Download a complete export of all your CRM data before making destructive changes" />
        <p className="text-xs text-white/40">
          Exports include all customers, leads, contacts, orders, appointments, and settings as a ZIP archive.
        </p>
        <Button variant="secondary" size="sm">
          <RefreshCw className="h-3.5 w-3.5" /> Request Data Export
        </Button>
      </div>

      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 space-y-4">
        <SectionHead icon={AlertTriangle} color="text-amber-400" title="Reset Website" subtitle="Clear all website pages, sections, and settings and start from scratch" />
        <p className="text-xs text-white/40">This is irreversible. All published pages and sections will be deleted.</p>
        <Button variant="danger" size="sm">
          <Trash2 className="h-3.5 w-3.5" /> Reset Website Builder
        </Button>
      </div>

      <div className="rounded-2xl border-2 border-red-500/30 bg-red-500/5 p-6 space-y-4">
        <SectionHead icon={AlertTriangle} color="text-red-400" title="Delete Workspace" subtitle="Permanently delete this workspace and all associated data" />
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-300 space-y-1">
          <p className="font-semibold">This action cannot be undone. It will:</p>
          <ul className="list-disc list-inside space-y-0.5 text-red-300/80">
            <li>Delete all customers, leads, contacts, and orders</li>
            <li>Remove all team members and revoke their access</li>
            <li>Cancel your subscription immediately</li>
            <li>Delete your website and all published content</li>
            <li>Remove all custom domains</li>
          </ul>
        </div>

        {!showDeleteConfirm ? (
          <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
            <AlertTriangle className="h-3.5 w-3.5" /> Delete Workspace
          </Button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={cn(labelCls, 'text-red-400')}>
                Type <strong>{tenantName}</strong> to confirm
              </label>
              <input
                className={cn(inputCls, 'border-red-500/40 focus:border-red-500/70')}
                placeholder={tenantName}
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowDeleteConfirm(false); setDeleteInput('') }}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                loading={deleting}
                disabled={!canDelete}
              >
                <Trash2 className="h-3.5 w-3.5" /> Permanently Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
