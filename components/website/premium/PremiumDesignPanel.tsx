'use client'
// components/website/premium/PremiumDesignPanel.tsx
// Full-featured AI Premium Design & Animations panel.
// Shown on the /website/ai-premium-design dashboard page and in the editor sidebar.

import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { AnimationPresetSelector } from './AnimationPresetSelector'
import type { ManualConfig } from './AnimationPresetSelector'
import type { ValidatedAiAnimationPlan } from '@/lib/website/animations/validateAnimationConfig'
import type { AnimationScope, AnimationIntensity, AnimationPerformance, DesiredVibe } from '@/lib/website/animations/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SiteSectionOption {
  id:           string
  section_type: string
  sort_order:   number
}

interface SitePageOption {
  id:    string
  title: string | null
  slug:  string
}

interface PlanRow {
  id:           string
  status:       string
  scope:        string
  desired_vibe: string | null
  ai_plan:      Partial<ValidatedAiAnimationPlan>
  created_at:   string
  applied_at:   string | null
}

interface Props {
  tenantId:       string
  /** Pre-selected page (optional) */
  initialPageId?: string | null
  /** Pre-selected section (optional) */
  initialSectionId?: string | null
  /** Compact mode for sidebar use */
  compact?: boolean
}

// ── Config options ────────────────────────────────────────────────────────────

const VIBE_OPTIONS: { value: DesiredVibe; label: string; desc: string; emoji: string }[] = [
  { value: 'luxury',             label: 'Luxury',             desc: 'Editorial, exclusivity, quiet luxury',   emoji: '✦' },
  { value: 'modern_saas',        label: 'Modern SaaS',        desc: 'Sleek, tech-forward, futuristic',        emoji: '⚡' },
  { value: 'warm_local',         label: 'Warm Local',         desc: 'Friendly, approachable, community',      emoji: '☀' },
  { value: 'editorial_boutique', label: 'Editorial Boutique', desc: 'Artisan, curated, boutique',             emoji: '◈' },
  { value: 'futuristic_premium', label: 'Futuristic',         desc: 'Bold glowing accents, dark mode',        emoji: '◉' },
  { value: 'clean_professional', label: 'Clean Professional', desc: 'Organized, trustworthy, business-ready', emoji: '▣' },
  { value: 'bold_conversion',    label: 'Bold & Convert',     desc: 'High-contrast, action-driving CTA',      emoji: '▶' },
]

const INTENSITY_OPTIONS: { value: AnimationIntensity; label: string }[] = [
  { value: 'subtle',    label: 'Subtle — nearly invisible premium feel' },
  { value: 'balanced',  label: 'Balanced — smooth & purposeful' },
  { value: 'cinematic', label: 'Cinematic — bold, dramatic entrance' },
]

const PERF_OPTIONS: { value: AnimationPerformance; label: string }[] = [
  { value: 'fast',     label: 'Fast — instant response, minimal motion' },
  { value: 'balanced', label: 'Balanced — quality with speed' },
  { value: 'premium',  label: 'Premium — full quality animations' },
]

const DEFAULT_MANUAL: ManualConfig = {
  preset: 'none', stylePreset: 'none', imageTreatment: 'none',
  buttonTreatment: 'standard', intensity: 'balanced', durationMs: 600, delayMs: 0, mobileEnabled: true,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-bold text-white/90">{title}</h2>
          {desc && <p className="text-xs text-white/40 mt-0.5">{desc}</p>}
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 py-2.5 text-sm font-medium rounded-xl transition-all duration-150 whitespace-nowrap',
        active
          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
          : 'text-white/40 hover:text-white/70 border border-transparent hover:bg-white/5',
      )}
    >
      {children}
    </button>
  )
}

function VibeButton({ active, opt, onClick }: { active: boolean; opt: typeof VIBE_OPTIONS[0]; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all duration-150',
        active
          ? 'bg-amber-500/10 border-amber-500/30 text-white'
          : 'bg-white/3 border-white/8 text-white/50 hover:border-white/20 hover:text-white/80',
      )}
    >
      <span className="text-base shrink-0 mt-0.5">{opt.emoji}</span>
      <div>
        <p className={cn('text-sm font-semibold mb-0.5', active ? 'text-amber-300' : '')}>{opt.label}</p>
        <p className="text-2xs leading-relaxed opacity-70">{opt.desc}</p>
      </div>
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PremiumDesignPanel({ tenantId, initialPageId, initialSectionId, compact = false }: Props) {
  // ── Scope state ──────────────────────────────────────────────────────────
  const [tab,       setTab]       = useState<'ai' | 'manual'>('ai')
  const [scope,     setScope]     = useState<AnimationScope>(initialSectionId ? 'section' : initialPageId ? 'page' : 'global')
  const [pageId,    setPageId]    = useState<string | null>(initialPageId ?? null)
  const [sectionId, setSectionId] = useState<string | null>(initialSectionId ?? null)

  // ── AI planning state ────────────────────────────────────────────────────
  const [vibe,      setVibe]      = useState<DesiredVibe>('clean_professional')
  const [intensity, setIntensity] = useState<AnimationIntensity>('balanced')
  const [perf,      setPerf]      = useState<AnimationPerformance>('balanced')
  const [mobile,    setMobile]    = useState(true)

  // ── Plan state ───────────────────────────────────────────────────────────
  const [planning,  setPlanning]  = useState(false)
  const [applying,  setApplying]  = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [plan,      setPlan]      = useState<PlanRow | null>(null)
  const [aiPlan,    setAiPlan]    = useState<ValidatedAiAnimationPlan | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState<string | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // ── Manual config state ──────────────────────────────────────────────────
  const [manual, setManual] = useState<ManualConfig>(DEFAULT_MANUAL)

  // ── Pages / sections for scope selector ─────────────────────────────────
  const [pages,    setPages]    = useState<SitePageOption[]>([])
  const [sections, setSections] = useState<SiteSectionOption[]>([])
  const [loadingContext, setLoadingContext] = useState(false)

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load pages ────────────────────────────────────────────────────────────
  useEffect(() => {
    void loadPages()
  }, [tenantId])

  async function loadPages() {
    setLoadingContext(true)
    try {
      const res = await fetch(`/api/website/pages?tenant_id=${tenantId}`)
      if (res.ok) {
        const d = await res.json() as { pages?: SitePageOption[] }
        setPages(d.pages ?? [])
        // Auto-select first page if none selected
        if (!pageId && d.pages?.length) setPageId(d.pages[0].id)
      }
    } catch { /* ignore */ }
    setLoadingContext(false)
  }

  // ── Load sections when page changes ──────────────────────────────────────
  useEffect(() => {
    if (!pageId) return
    void loadSections(pageId)
  }, [pageId])

  async function loadSections(pid: string) {
    try {
      const res = await fetch(`/api/website/sections?page_id=${pid}`)
      if (res.ok) {
        const d = await res.json() as { sections?: SiteSectionOption[] }
        setSections(d.sections ?? [])
      }
    } catch { /* ignore */ }
  }

  // ── Load existing plan ────────────────────────────────────────────────────
  useEffect(() => {
    void loadLatestPlan()
  }, [tenantId, pageId, sectionId])

  async function loadLatestPlan() {
    const params = new URLSearchParams({ tenantId, status: 'planned' })
    if (sectionId) params.set('sectionId', sectionId)
    if (pageId)    params.set('pageId', pageId)
    try {
      const res  = await fetch(`/api/website/ai/animations/plans?${params}`)
      if (!res.ok) return
      const data = await res.json() as { plans?: PlanRow[] }
      const latest = data.plans?.[0]
      if (latest) {
        setPlan(latest)
        setAiPlan(latest.ai_plan as ValidatedAiAnimationPlan)
      }
    } catch { /* ignore */ }
  }

  function flash(msg: string, isError = false) {
    if (successTimer.current) clearTimeout(successTimer.current)
    if (isError) {
      setError(msg)
      setSuccess(null)
    } else {
      setSuccess(msg)
      setError(null)
      successTimer.current = setTimeout(() => setSuccess(null), 4000)
    }
  }

  // ── Generate plan ─────────────────────────────────────────────────────────
  async function handlePlan() {
    setPlanning(true)
    setError(null)
    setPlan(null)
    setAiPlan(null)
    setSelectedKeys(new Set())

    try {
      const res = await fetch('/api/website/ai/animations/plan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenantId,
          pageId:    scope !== 'global' ? pageId : null,
          sectionId: scope === 'section' ? sectionId : null,
          scope, desiredVibe: vibe, intensity, performanceMode: perf,
          includeMobileAnimations: mobile,
        }),
      })
      const data = await res.json() as { plan?: PlanRow; aiPlan?: ValidatedAiAnimationPlan; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Generation failed')
      if (data.plan)   setPlan(data.plan)
      if (data.aiPlan) setAiPlan(data.aiPlan)
      flash('Premium design plan generated!')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Generation failed. Check GEMINI_API_KEY.', true)
    } finally {
      setPlanning(false)
    }
  }

  // ── Apply plan ────────────────────────────────────────────────────────────
  async function handleApply() {
    if (!plan) return
    setApplying(true)
    setError(null)

    try {
      const res = await fetch('/api/website/ai/animations/apply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          planId:                plan.id,
          applyScope:            scope,
          selectedAnimationKeys: selectedKeys.size > 0 ? [...selectedKeys] : undefined,
        }),
      })
      const data = await res.json() as { ok?: boolean; message?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Apply failed')
      flash(data.message ?? 'Animations applied to your website!')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Apply failed.', true)
    } finally {
      setApplying(false)
    }
  }

  // ── Disable animations ────────────────────────────────────────────────────
  async function handleDisable() {
    setDisabling(true)
    setError(null)

    try {
      const res = await fetch('/api/website/ai/animations/disable', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenantId, scope,
          pageId:    scope !== 'global' ? pageId : null,
          sectionId: scope === 'section' ? sectionId : null,
          planId:    plan?.id ?? null,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Disable failed')
      setPlan(null)
      setAiPlan(null)
      flash('Animations disabled. Your website looks clean.')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Disable failed.', true)
    } finally {
      setDisabling(false)
    }
  }

  // ── Save manual config ────────────────────────────────────────────────────
  async function handleSaveManual() {
    setSaving(true)
    setError(null)

    const animConfig = {
      v: 1, enabled: manual.preset !== 'none',
      animation: {
        preset:        manual.preset !== 'none' ? manual.preset : undefined,
        intensity:     manual.intensity,
        durationMs:    manual.durationMs,
        delayMs:       manual.delayMs,
        mobileEnabled: manual.mobileEnabled,
      },
      style: {
        stylePreset:     manual.stylePreset !== 'none' ? manual.stylePreset : undefined,
        imageTreatment:  manual.imageTreatment !== 'none' ? manual.imageTreatment : undefined,
        buttonTreatment: manual.buttonTreatment !== 'standard' ? manual.buttonTreatment : undefined,
      },
    }

    try {
      if (scope === 'section' && sectionId) {
        const res = await fetch(`/api/website/sections/${sectionId}/animation`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ animation_config: animConfig, style_config: animConfig }),
        })
        const data = await res.json() as { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Save failed')
        flash('Section animation saved!')
      } else {
        // Apply global/page via the apply endpoint using a manual-scope approach
        // Create a minimal plan first, then apply
        flash('For manual global/page styling, use the AI plan and Apply button, or select a specific section.', true)
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Save failed.', true)
    } finally {
      setSaving(false)
    }
  }

  const busy = planning || applying || disabling || saving
  const hasPlan = !!aiPlan

  return (
    <div className={cn('space-y-6', compact && 'space-y-4')}>
      {!compact && (
        <SectionHeader
          icon="✦"
          title="AI Premium Design"
          desc="Generate luxury UI polish, motion, and section styling powered by AI."
        />
      )}

      {/* ── Tab: AI vs Manual ── */}
      <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/8">
        <TabBtn active={tab === 'ai'}     onClick={() => setTab('ai')}>AI Design Plan</TabBtn>
        <TabBtn active={tab === 'manual'} onClick={() => setTab('manual')}>Manual Controls</TabBtn>
      </div>

      {/* ── Scope selector ── */}
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Apply to</p>
        <div className="flex gap-1">
          {(['global', 'page', 'section'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                'flex-1 py-2 rounded-xl text-xs font-semibold border transition-all',
                scope === s
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20',
              )}
            >
              {s === 'global' ? 'Entire Website' : s === 'page' ? 'Current Page' : 'Section'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Page selector ── */}
      {(scope === 'page' || scope === 'section') && (
        <div>
          <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wide">Page</label>
          <select
            value={pageId ?? ''}
            onChange={e => setPageId(e.target.value || null)}
            disabled={loadingContext || busy}
            className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-white/80 px-3 py-2.5 focus:outline-none focus:border-amber-500/50 disabled:opacity-40 appearance-none"
          >
            <option value="" className="bg-zinc-900">All pages</option>
            {pages.map(p => (
              <option key={p.id} value={p.id} className="bg-zinc-900">{p.title ?? p.slug}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Section selector ── */}
      {scope === 'section' && (
        <div>
          <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wide">Section</label>
          <select
            value={sectionId ?? ''}
            onChange={e => setSectionId(e.target.value || null)}
            disabled={loadingContext || busy}
            className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-white/80 px-3 py-2.5 focus:outline-none focus:border-amber-500/50 disabled:opacity-40 appearance-none"
          >
            <option value="" className="bg-zinc-900">Select a section…</option>
            {sections.map(s => (
              <option key={s.id} value={s.id} className="bg-zinc-900">
                {s.section_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} (#{s.sort_order})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── AI tab content ── */}
      {tab === 'ai' && (
        <div className="space-y-5">
          {/* Vibe */}
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Design Vibe</p>
            <div className="grid grid-cols-1 gap-2">
              {VIBE_OPTIONS.map(opt => (
                <VibeButton key={opt.value} active={vibe === opt.value} opt={opt} onClick={() => setVibe(opt.value)} />
              ))}
            </div>
          </div>

          {/* Intensity + Perf */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Animation Intensity</p>
              <div className="space-y-1.5">
                {INTENSITY_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setIntensity(o.value)}
                    className={cn(
                      'w-full text-left px-3.5 py-2.5 rounded-xl border text-sm transition-all',
                      intensity === o.value
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'border-white/8 text-white/40 hover:border-white/20 hover:text-white/70',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Performance Mode</p>
              <div className="space-y-1.5">
                {PERF_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setPerf(o.value)}
                    className={cn(
                      'w-full text-left px-3.5 py-2.5 rounded-xl border text-sm transition-all',
                      perf === o.value
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'border-white/8 text-white/40 hover:border-white/20 hover:text-white/70',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" checked={mobile} onChange={e => setMobile(e.target.checked)} className="sr-only" />
              <div className={`w-10 h-6 rounded-full transition-colors ${mobile ? 'bg-amber-500' : 'bg-white/10'}`} />
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${mobile ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm text-white/60">Mobile animations</span>
          </label>

          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-500/8 border border-violet-500/15 text-xs text-violet-300">
            <span>♿</span>
            <span>prefers-reduced-motion is always respected and cannot be disabled.</span>
          </div>

          {/* Generate button */}
          <button
            onClick={handlePlan}
            disabled={busy}
            className={cn(
              'w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl text-sm font-bold transition-all',
              planning
                ? 'bg-amber-900/40 text-amber-400/60 cursor-wait'
                : 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40',
            )}
          >
            {planning ? (
              <><span className="animate-spin text-base">◌</span> Generating Premium Plan…</>
            ) : (
              <><span>✦</span> {hasPlan ? 'Regenerate Plan' : 'Generate Premium Design Plan'}</>
            )}
          </button>

          {/* Plan result */}
          {hasPlan && aiPlan && (
            <PlanPreview
              aiPlan={aiPlan}
              selectedKeys={selectedKeys}
              onToggleKey={key => setSelectedKeys(prev => {
                const next = new Set(prev)
                if (next.has(key)) { next.delete(key) } else { next.add(key) }
                return next
              })}
            />
          )}

          {/* Apply / Disable */}
          {hasPlan && (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleApply}
                disabled={busy}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  applying
                    ? 'bg-blue-900/40 text-blue-400/60 cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md',
                )}
              >
                {applying ? '⏳ Applying…' : '▶ Apply to Website'}
              </button>
              <button
                onClick={handleDisable}
                disabled={busy}
                className="w-full py-2 rounded-xl text-sm text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 transition-all"
              >
                {disabling ? 'Disabling…' : '✕ Disable Animations'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Manual tab content ── */}
      {tab === 'manual' && (
        <div className="space-y-5">
          {scope !== 'section' && (
            <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/50">
              Manual controls save to individual sections. Select <strong className="text-white/70">Section</strong> scope and choose a section to save manual styling.
            </div>
          )}

          <AnimationPresetSelector
            config={manual}
            onChange={setManual}
            disabled={busy}
          />

          <button
            onClick={handleSaveManual}
            disabled={busy || scope !== 'section' || !sectionId}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
              busy || scope !== 'section' || !sectionId
                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md',
            )}
          >
            {saving ? '⏳ Saving…' : '✓ Save Section Animation'}
          </button>

          {scope !== 'section' && (
            <p className="text-xs text-white/30 text-center">
              Select a section from the scope picker above to enable saving.
            </p>
          )}
        </div>
      )}

      {/* ── Feedback messages ── */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 leading-relaxed">
          {error}
        </div>
      )}
      {success && (
        <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">
          {success}
        </div>
      )}
    </div>
  )
}

// ── Plan preview sub-component ────────────────────────────────────────────────

function PlanPreview({
  aiPlan,
  selectedKeys,
  onToggleKey,
}: {
  aiPlan:       ValidatedAiAnimationPlan
  selectedKeys: Set<string>
  onToggleKey:  (k: string) => void
}) {
  function toLabel(s: string) {
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  return (
    <div className="space-y-3 mt-1">
      {/* Summary */}
      <div className="rounded-2xl bg-white/3 border border-white/8 px-4 py-4">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">AI Design Summary</p>
        <p className="text-sm text-white/70 leading-relaxed">{aiPlan.summary}</p>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {[aiPlan.globalStyle.visualTier, aiPlan.globalStyle.mood, aiPlan.globalStyle.surfaceStyle].filter(Boolean).map(tag => (
            <span key={tag} className="text-2xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20 font-semibold uppercase tracking-wide">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Palette */}
      {aiPlan.globalStyle.recommendedPalette && (
        <div className="rounded-2xl bg-white/3 border border-white/8 px-4 py-3">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Recommended Palette</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(aiPlan.globalStyle.recommendedPalette).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5" title={`${k}: ${String(v)}`}>
                <div className="w-4 h-4 rounded-md border border-white/10 shrink-0" style={{ background: String(v) }} />
                <span className="text-2xs text-white/30">{k}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Animations */}
      {aiPlan.animations.length > 0 && (
        <div className="rounded-2xl bg-white/3 border border-white/8 px-4 py-4">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
            Animations ({aiPlan.animations.length}) — click to toggle
          </p>
          <div className="space-y-2">
            {aiPlan.animations.map((anim, i) => {
              const key    = anim.targetKey
              const active = selectedKeys.size === 0 || selectedKeys.has(key)
              return (
                <button
                  key={i}
                  onClick={() => onToggleKey(key)}
                  className={cn(
                    'w-full text-left p-3 rounded-xl border transition-all',
                    active
                      ? 'bg-amber-500/8 border-amber-500/20'
                      : 'bg-transparent border-white/8 opacity-50',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn('text-xs font-bold', active ? 'text-amber-300' : 'text-white/40')}>
                      {anim.targetKey}
                    </span>
                    <span className="text-2xs text-white/30 font-mono">{anim.animationPreset}</span>
                  </div>
                  <p className="text-2xs text-white/50 leading-relaxed">{anim.reason}</p>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    <Tag label={anim.intensity} />
                    <Tag label={`${anim.durationMs}ms`} />
                    {!anim.mobileEnabled && <Tag label="desktop only" dim />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Section upgrades */}
      {aiPlan.sectionUpgrades.length > 0 && (
        <div className="rounded-2xl bg-white/3 border border-white/8 px-4 py-4">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
            Section Upgrades ({aiPlan.sectionUpgrades.length})
          </p>
          <div className="space-y-3">
            {aiPlan.sectionUpgrades.map((up, i) => (
              <div key={i} className="pb-3 border-b border-white/5 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-white/80">{up.sectionType.replace(/_/g, ' ')}</span>
                  <span className="text-2xs px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-semibold">{up.stylePreset}</span>
                </div>
                {up.layoutRecommendation && (
                  <p className="text-2xs text-white/40 leading-relaxed">{up.layoutRecommendation}</p>
                )}
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {up.imageTreatment !== 'none' && <Tag label={up.imageTreatment} />}
                  {up.buttonTreatment !== 'standard' && <Tag label={up.buttonTreatment} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance */}
      <div className="rounded-2xl bg-white/3 border border-white/8 px-4 py-3">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Performance</p>
        <div className="space-y-1.5">
          <RuleRow label="Reduced motion respected"   value={true} />
          <RuleRow label="Avoid heavy on mobile"       value={aiPlan.performanceRules.avoidHeavyAnimationsOnMobile} />
          <RuleRow label="Lazy load below fold"        value={aiPlan.performanceRules.lazyLoadBelowFold} />
          <RuleRow label="Max elements / viewport"     value={String(aiPlan.performanceRules.maxAnimatedElementsPerViewport)} />
        </div>
      </div>
    </div>
  )
}

function Tag({ label, dim = false }: { label: string; dim?: boolean }) {
  return (
    <span className={cn(
      'text-2xs px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide',
      dim ? 'bg-white/5 text-white/30' : 'bg-amber-500/10 text-amber-300',
    )}>
      {label}
    </span>
  )
}

function RuleRow({ label, value }: { label: string; value: boolean | string }) {
  const isTrue = value === true
  return (
    <div className="flex justify-between text-xs">
      <span className="text-white/40">{label}</span>
      <span className={cn('font-semibold', typeof value === 'string' ? 'text-white/60' : isTrue ? 'text-emerald-400' : 'text-red-400')}>
        {typeof value === 'boolean' ? (value ? '✓' : '✗') : value}
      </span>
    </div>
  )
}
