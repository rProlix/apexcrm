'use client'
// components/website/ThemeClient.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Palette, Save, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { staggerContainer, fadeUp } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { normalizeTheme } from '@/lib/website/normalizeTheme'
import type { SiteSettings, WebsiteTheme } from '@/lib/website/types'

interface Props {
  tenantId:        string
  initialSettings: SiteSettings | null
}

const FONT_OPTIONS = [
  'Inter', 'Geist', 'DM Sans', 'Poppins', 'Raleway',
  'Playfair Display', 'Merriweather', 'Space Grotesk', 'Sora',
]

const RADIUS_OPTIONS: Array<{ value: WebsiteTheme['borderRadius']; label: string }> = [
  { value: 'none', label: 'Sharp' },
  { value: 'sm',   label: 'Soft' },
  { value: 'md',   label: 'Round' },
  { value: 'lg',   label: 'Rounded' },
  { value: 'xl',   label: 'Extra' },
  { value: 'full', label: 'Pill' },
]

export function ThemeClient({ tenantId, initialSettings }: Props) {
  const resolved = normalizeTheme(initialSettings as SiteSettings)

  const [primary,    setPrimary]    = useState(resolved.primaryColor)
  const [accent,     setAccent]     = useState(resolved.accentColor)
  const [bg,         setBg]         = useState(resolved.backgroundColor)
  const [surface,    setSurface]    = useState(resolved.surfaceColor)
  const [textColor,  setTextColor]  = useState(resolved.textColor)
  const [border,     setBorder]     = useState(resolved.borderColor)
  const [fontHead,   setFontHead]   = useState(resolved.fontHeading)
  const [fontBody,   setFontBody]   = useState(resolved.fontBody)
  const [radius,     setRadius]     = useState<WebsiteTheme['borderRadius']>(resolved.borderRadius)
  const [mode,       setMode]       = useState<'dark' | 'light'>(resolved.mode)
  const [logoUrl,    setLogoUrl]    = useState(initialSettings?.logo_url ?? '')
  const [faviconUrl, setFaviconUrl] = useState(initialSettings?.favicon_url ?? '')
  const [siteName,   setSiteName]   = useState(initialSettings?.site_name ?? '')

  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  function resetDefaults() {
    const d = normalizeTheme(null)
    setPrimary(d.primaryColor); setAccent(d.accentColor)
    setBg(d.backgroundColor);  setSurface(d.surfaceColor)
    setTextColor(d.textColor); setBorder(d.borderColor)
    setFontHead(d.fontHeading); setFontBody(d.fontBody)
    setRadius(d.borderRadius); setMode(d.mode)
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/website/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenant_id:   tenantId,
          site_name:   siteName.trim() || null,
          logo_url:    logoUrl.trim()  || null,
          favicon_url: faviconUrl.trim() || null,
          brand_colors: {
            primary:    primary,
            accent:     accent,
            background: bg,
            surface:    surface,
            text:       textColor,
            border:     border,
          },
          fonts: { heading: fontHead, body: fontBody },
          theme: { borderRadius: radius, mode },
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

  const inputCls = 'w-full bg-graphite-700 border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors'
  const labelCls = 'block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5'

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Theme</h1>
          <p className="text-sm text-white/40 mt-0.5">Customize your site's visual identity</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={resetDefaults}
            className="h-10 px-4 rounded-xl text-sm text-white/40 hover:text-white border border-surface-border hover:border-white/20 transition-colors flex items-center gap-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {saved ? <><Check className="h-4 w-4" /> Saved</> : <><Save className="h-4 w-4" /> Save Theme</>}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <motion.div variants={staggerContainer(0.05)} initial="hidden" animate="visible" className="space-y-6">

        {/* Site identity */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Palette className="h-4 w-4 text-pink-400" />
            <h2 className="text-sm font-semibold text-white">Site Identity</h2>
          </div>
          <div>
            <label className={labelCls}>Site Name</label>
            <input className={inputCls} placeholder="My Awesome Store" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Logo URL</label>
            <input className={inputCls} placeholder="https://cdn.example.com/logo.png" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
            {logoUrl && (
              <div className="mt-2 h-12 w-auto inline-flex items-center justify-center rounded-lg border border-surface-border bg-graphite-700 px-3">
                <img src={logoUrl} alt="Logo preview" className="max-h-8 max-w-[120px] object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>Favicon URL</label>
            <input className={inputCls} placeholder="https://cdn.example.com/favicon.ico" value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} />
          </div>
        </motion.div>

        {/* Mode */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Color Mode</h2>
          <div className="flex gap-3">
            {(['dark', 'light'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 h-20 rounded-xl border-2 transition-all duration-200 flex flex-col items-center justify-center gap-2 capitalize font-semibold text-sm',
                  mode === m
                    ? 'border-gold-500/60 bg-gold-500/10 text-gold-400'
                    : 'border-surface-border text-white/40 hover:border-white/20 hover:text-white/70'
                )}
              >
                <div className={cn(
                  'h-8 w-14 rounded-lg',
                  m === 'dark' ? 'bg-graphite-950' : 'bg-white border border-graphite-200'
                )} />
                {m}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Colors */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white mb-2">Brand Colors</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Primary',    value: primary,   set: setPrimary },
              { label: 'Accent',     value: accent,    set: setAccent },
              { label: 'Background', value: bg,        set: setBg },
              { label: 'Surface',    value: surface,   set: setSurface },
              { label: 'Text',       value: textColor, set: setTextColor },
              { label: 'Border',     value: border,    set: setBorder },
            ].map((c) => (
              <div key={c.label}>
                <label className={labelCls}>{c.label}</label>
                <div className="flex items-center gap-2.5">
                  <div className="relative h-10 w-10 rounded-xl border border-surface-border overflow-hidden shrink-0">
                    <input
                      type="color"
                      value={c.value.startsWith('#') ? c.value : '#c9a84c'}
                      onChange={(e) => c.set(e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer border-0 p-0 bg-transparent"
                    />
                  </div>
                  <input
                    className={cn(inputCls, 'font-mono text-xs')}
                    value={c.value}
                    onChange={(e) => c.set(e.target.value)}
                    placeholder="#000000"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Live preview swatch */}
          <div className="mt-4 rounded-xl overflow-hidden border border-surface-border">
            <div className="h-12 flex items-center px-4 gap-3" style={{ backgroundColor: bg, borderBottom: `1px solid ${border}` }}>
              <div className="h-6 w-20 rounded-md" style={{ backgroundColor: primary }} />
              <div className="h-6 w-16 rounded-md" style={{ backgroundColor: surface, border: `1px solid ${border}` }} />
            </div>
            <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: surface }}>
              <p className="text-sm font-semibold" style={{ color: textColor }}>Sample text</p>
              <p className="text-xs" style={{ color: textColor, opacity: 0.5 }}>Muted text</p>
              <div className="ml-auto h-7 px-3 rounded-lg text-xs flex items-center font-medium" style={{ backgroundColor: accent, color: bg }}>
                Button
              </div>
            </div>
          </div>
        </motion.div>

        {/* Typography */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white mb-2">Typography</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Heading Font</label>
              <select
                className={cn(inputCls, 'cursor-pointer')}
                value={fontHead}
                onChange={(e) => setFontHead(e.target.value)}
              >
                {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Body Font</label>
              <select
                className={cn(inputCls, 'cursor-pointer')}
                value={fontBody}
                onChange={(e) => setFontBody(e.target.value)}
              >
                {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
        </motion.div>

        {/* Border radius */}
        <motion.div variants={fadeUp} className="rounded-2xl border border-surface-border bg-graphite-800/50 p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Corner Style</h2>
          <div className="flex gap-2 flex-wrap">
            {RADIUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRadius(opt.value)}
                className={cn(
                  'h-9 px-4 border text-sm font-medium transition-all duration-200',
                  opt.value === 'none' ? 'rounded-none' :
                  opt.value === 'sm'   ? 'rounded-sm'   :
                  opt.value === 'md'   ? 'rounded-md'   :
                  opt.value === 'lg'   ? 'rounded-lg'   :
                  opt.value === 'xl'   ? 'rounded-xl'   :
                  'rounded-full',
                  radius === opt.value
                    ? 'border-gold-500/60 bg-gold-500/10 text-gold-400'
                    : 'border-surface-border text-white/40 hover:border-white/20 hover:text-white/70'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </motion.div>

      </motion.div>
    </div>
  )
}
