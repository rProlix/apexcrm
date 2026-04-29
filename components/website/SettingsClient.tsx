'use client'
// components/website/SettingsClient.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Settings, Globe, Search, Check, Save, AlertCircle,
  ExternalLink, Copy, Link, Shield, Info, Trash2, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { staggerContainer, fadeUp } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { SiteSettings, DomainType } from '@/lib/website/types'

interface Props {
  tenantId:        string
  tenantSlug:      string
  initialSettings: SiteSettings | null
  verifiedDomains: string[]
  allDomains:      Array<{ hostname: string; verified: boolean }>
}

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

export function SettingsClient({
  tenantId, tenantSlug, initialSettings, verifiedDomains, allDomains,
}: Props) {
  // General
  const [siteName,     setSiteName]     = useState(initialSettings?.site_name      ?? '')

  // Domain
  const [customDomain, setCustomDomain] = useState(initialSettings?.custom_domain  ?? '')
  const [domainType,   setDomainType]   = useState<DomainType>(
    initialSettings?.domain_type ?? 'subdomain'
  )
  const [domains,      setDomains]      = useState(allDomains)
  const [newDomain,    setNewDomain]    = useState('')

  // SEO
  const [seoTitle,   setSeoTitle]   = useState((initialSettings?.seo_defaults as Record<string,string> | null)?.title ?? '')
  const [seoDesc,    setSeoDesc]    = useState((initialSettings?.seo_defaults as Record<string,string> | null)?.description ?? '')
  const [seoOgImage, setSeoOgImage] = useState((initialSettings?.seo_defaults as Record<string,string> | null)?.ogImage ?? '')
  const [twitter,    setTwitter]    = useState((initialSettings?.seo_defaults as Record<string,string> | null)?.twitterHandle ?? '')

  // Header / footer
  const headerCfg = initialSettings?.header_config as unknown as Record<string, boolean | string> | null
  const footerCfg = initialSettings?.footer_config as unknown as Record<string, boolean | string> | null

  const [headerShowLogo,    setHeaderShowLogo]    = useState((headerCfg?.showLogo    as boolean)  ?? true)
  const [headerShowNav,     setHeaderShowNav]     = useState((headerCfg?.showNav     as boolean)  ?? true)
  const [headerTransparent, setHeaderTransparent] = useState((headerCfg?.transparent as boolean)  ?? false)
  const [headerSticky,      setHeaderSticky]      = useState((headerCfg?.sticky      as boolean)  ?? true)
  const [footerShowLogo,    setFooterShowLogo]    = useState((footerCfg?.showLogo    as boolean)  ?? true)
  const [footerTagline,     setFooterTagline]     = useState((footerCfg?.tagline     as string)   ?? '')
  const [footerCopyright,   setFooterCopyright]   = useState((footerCfg?.copyright   as string)   ?? '')

  // UI state
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [copied,    setCopied]    = useState(false)
  const [addingDomain, setAddingDomain] = useState(false)
  const [domainError,  setDomainError]  = useState<string | null>(null)

  // Computed
  const subdomainUrl    = `https://${tenantSlug}.${ROOT_DOMAIN}`
  const activePublicUrl = domainType === 'custom' && verifiedDomains[0]
    ? `https://${verifiedDomains[0]}`
    : subdomainUrl

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/website/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id:    tenantId,
          site_name:    siteName.trim() || null,
          custom_domain: customDomain.trim().toLowerCase() || null,
          domain_type:  domainType,
          seo_defaults: {
            title:         seoTitle.trim()   || null,
            description:   seoDesc.trim()    || null,
            ogImage:       seoOgImage.trim() || null,
            twitterHandle: twitter.trim()    || null,
          },
          header_config: {
            showLogo:    headerShowLogo,
            showNav:     headerShowNav,
            transparent: headerTransparent,
            sticky:      headerSticky,
          },
          footer_config: {
            showLogo:  footerShowLogo,
            tagline:   footerTagline.trim()   || null,
            copyright: footerCopyright.trim() || null,
          },
        }),
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
  }

  async function handleAddDomain() {
    const domain = newDomain.trim().toLowerCase().replace(/https?:\/\//, '')
    if (!domain) return
    setAddingDomain(true); setDomainError(null)
    try {
      const res = await fetch('/api/website/domain', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, hostname: domain }),
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
    try {
      const res = await fetch('/api/website/domain', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, hostname }),
      })
      if (!res.ok) throw new Error('Failed to remove domain')
      setDomains((prev) => prev.filter((d) => d.hostname !== hostname))
      if (customDomain === hostname) setCustomDomain('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove domain')
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const inputCls = 'w-full bg-graphite-700 border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors'
  const labelCls = 'block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5'

  const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="flex items-center justify-between cursor-pointer py-1">
      <span className="text-sm text-white/70">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'relative h-6 w-11 rounded-full border-2 transition-colors duration-200',
          value ? 'bg-gold-500/30 border-gold-500/60' : 'bg-white/8 border-white/15'
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full transition-transform duration-200',
          value ? 'translate-x-5 bg-gold-400' : 'translate-x-0.5 bg-white/30'
        )} />
      </button>
    </label>
  )

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
          <p className="text-sm text-white/40 mt-0.5">Domain, SEO, header, and footer configuration</p>
        </div>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          {saved
            ? <><Check className="h-4 w-4" /> Saved</>
            : <><Save className="h-4 w-4" /> Save Settings</>
          }
        </Button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <motion.div variants={staggerContainer(0.05)} initial="hidden" animate="visible" className="space-y-6">

        {/* General */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="h-4 w-4 text-gold-400" />
            <h2 className="text-sm font-semibold text-white">General</h2>
          </div>
          <div>
            <label className={labelCls}>Site Name</label>
            <input
              className={inputCls}
              placeholder="My Business"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
            />
          </div>
        </motion.div>

        {/* ── Platform Subdomain ─────────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Link className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Platform Subdomain</h2>
            <span className="ml-auto text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-full px-2 py-0.5 font-medium">
              Always active
            </span>
          </div>
          <p className="text-xs text-white/40">
            Your site is always available at this URL — even without a custom domain.
          </p>

          <div className="flex items-center gap-2 bg-graphite-700/60 border border-surface-border rounded-xl px-4 py-3">
            <Globe className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="flex-1 text-sm text-white font-mono">{subdomainUrl}</span>
            <button
              onClick={() => copyToClipboard(subdomainUrl)}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a
              href={subdomainUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/30 hover:text-blue-400 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </motion.div>

        {/* ── Domain Type Toggle ─────────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-gold-400" />
            <h2 className="text-sm font-semibold text-white">Active Domain</h2>
          </div>
          <p className="text-xs text-white/40">
            Choose which domain powers your public website.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Subdomain option */}
            <button
              onClick={() => setDomainType('subdomain')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                domainType === 'subdomain'
                  ? 'border-gold-500/60 bg-gold-500/8'
                  : 'border-surface-border bg-graphite-700/40 hover:border-white/20'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={cn(
                  'h-3.5 w-3.5 rounded-full border-2 transition-colors',
                  domainType === 'subdomain' ? 'border-gold-400 bg-gold-400' : 'border-white/20'
                )} />
                <span className="text-sm font-medium text-white">Subdomain</span>
              </div>
              <p className="text-xs text-white/40 ml-5.5">{tenantSlug}.{ROOT_DOMAIN}</p>
            </button>

            {/* Custom domain option */}
            <button
              onClick={() => setDomainType('custom')}
              disabled={verifiedDomains.length === 0}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                domainType === 'custom'
                  ? 'border-gold-500/60 bg-gold-500/8'
                  : 'border-surface-border bg-graphite-700/40 hover:border-white/20',
                verifiedDomains.length === 0 && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={cn(
                  'h-3.5 w-3.5 rounded-full border-2 transition-colors',
                  domainType === 'custom' ? 'border-gold-400 bg-gold-400' : 'border-white/20'
                )} />
                <span className="text-sm font-medium text-white">Custom Domain</span>
              </div>
              <p className="text-xs text-white/40 ml-5.5">
                {verifiedDomains[0] ?? 'No verified domain yet'}
              </p>
            </button>
          </div>

          {/* Current active URL */}
          <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-4 py-3 flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-emerald-400 font-semibold mb-0.5">Active public URL</p>
              <p className="text-xs text-emerald-300/70 truncate font-mono">{activePublicUrl}</p>
            </div>
            <a href={activePublicUrl} target="_blank" rel="noopener noreferrer"
               className="text-emerald-400/60 hover:text-emerald-400 transition-colors shrink-0">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </motion.div>

        {/* ── Custom Domain Management ──────────────────────────────────── */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-white">Custom Domains</h2>
          </div>

          {/* Domain list */}
          {domains.length > 0 && (
            <div className="space-y-2">
              {domains.map((d) => (
                <div key={d.hostname}
                  className="flex items-center gap-3 bg-graphite-700/40 rounded-xl px-4 py-2.5 border border-surface-border">
                  <Globe className="h-3.5 w-3.5 text-white/30 shrink-0" />
                  <span className="flex-1 text-sm text-white font-mono">{d.hostname}</span>
                  {d.verified
                    ? <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <Check className="h-3 w-3" /> Verified
                      </span>
                    : <span className="text-xs text-amber-400/80 flex items-center gap-1">
                        <Info className="h-3 w-3" /> Pending
                      </span>
                  }
                  <button
                    onClick={() => handleRemoveDomain(d.hostname)}
                    className="text-white/20 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add domain */}
          <div className="flex gap-2">
            <input
              className={cn(inputCls, 'flex-1')}
              placeholder="www.yourdomain.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value.replace(/https?:\/\//, '').toLowerCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
            />
            <Button variant="secondary" onClick={handleAddDomain} loading={addingDomain}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {domainError && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> {domainError}
            </p>
          )}

          {/* DNS instructions */}
          <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-4 space-y-3">
            <p className="text-xs font-semibold text-blue-300 flex items-center gap-2">
              <Info className="h-3.5 w-3.5" /> DNS Setup Instructions
            </p>
            <p className="text-xs text-white/50">
              Point your domain to this platform by adding the following DNS record in your domain registrar:
            </p>
            <div className="rounded-lg bg-graphite-900/60 border border-white/8 p-3 font-mono text-xs space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="text-white/30 w-12">Type</span>
                <span className="text-amber-300">CNAME</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/30 w-12">Name</span>
                <span className="text-white">@ or www</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/30 w-12">Value</span>
                <span className="text-emerald-300">cname.vercel-dns.com</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/30 w-12">TTL</span>
                <span className="text-white">3600</span>
              </div>
            </div>
            <p className="text-xs text-white/30">
              After saving your DNS record, verification can take up to 48 hours.
              The domain status will update automatically.
            </p>
          </div>
        </motion.div>

        {/* SEO */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Search className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-white">SEO Defaults</h2>
          </div>
          <p className="text-xs text-white/30">These apply site-wide. Individual pages can override them.</p>
          <div>
            <label className={labelCls}>Default Title</label>
            <input className={inputCls} placeholder="My Store — {{page}}" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Default Meta Description</label>
            <textarea
              className={cn(inputCls, 'resize-none h-20')}
              placeholder="A brief description of your business for search engines."
              value={seoDesc}
              onChange={(e) => setSeoDesc(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Default OG Image URL</label>
            <input className={inputCls} placeholder="https://cdn.example.com/og.png" value={seoOgImage} onChange={(e) => setSeoOgImage(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Twitter Handle</label>
            <input className={inputCls} placeholder="@mybusiness" value={twitter} onChange={(e) => setTwitter(e.target.value)} />
          </div>
        </motion.div>

        {/* Header */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-2">
          <h2 className="text-sm font-semibold text-white mb-3">Header Options</h2>
          <Toggle value={headerShowLogo}    onChange={setHeaderShowLogo}    label="Show Logo" />
          <Toggle value={headerShowNav}     onChange={setHeaderShowNav}     label="Show Navigation" />
          <Toggle value={headerTransparent} onChange={setHeaderTransparent} label="Transparent Header" />
          <Toggle value={headerSticky}      onChange={setHeaderSticky}      label="Sticky Header" />
        </motion.div>

        {/* Footer */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white mb-3">Footer Options</h2>
          <Toggle value={footerShowLogo} onChange={setFooterShowLogo} label="Show Logo in Footer" />
          <div>
            <label className={labelCls}>Tagline</label>
            <input className={inputCls} placeholder="Quality products, delivered fast." value={footerTagline} onChange={(e) => setFooterTagline(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Copyright Text</label>
            <input
              className={inputCls}
              placeholder={`© ${new Date().getFullYear()} My Business. All rights reserved.`}
              value={footerCopyright}
              onChange={(e) => setFooterCopyright(e.target.value)}
            />
          </div>
        </motion.div>

      </motion.div>
    </div>
  )
}
