'use client'
// components/website/builder/AiPremiumDesignPanel.tsx
// AI Premium Animation & Luxury UI Designer panel for the website builder.
// Appears inside EditorSidebar as a collapsible panel.

import { useState, useEffect, useCallback } from 'react'
import type { DesiredVibe, AnimationIntensity, AnimationPerformance, AnimationScope } from '@/lib/website/animations/types'
import type { ValidatedAiAnimationPlan } from '@/lib/website/animations/validateAnimationConfig'

interface Props {
  tenantId:  string
  sectionId?: string | null
  pageId?:    string | null
}

type PanelState = 'idle' | 'planning' | 'planned' | 'applying' | 'applied' | 'disabling' | 'error'

interface PlanResult {
  planId:    string
  aiPlan:    ValidatedAiAnimationPlan
}

// ── Vibe options ─────────────────────────────────────────────────────────────

const VIBE_OPTIONS: { value: DesiredVibe; label: string; emoji: string }[] = [
  { value: 'luxury',             label: 'Luxury',             emoji: '✦' },
  { value: 'modern_saas',        label: 'Modern SaaS',        emoji: '⚡' },
  { value: 'warm_local',         label: 'Warm Local',         emoji: '☀️' },
  { value: 'editorial_boutique', label: 'Editorial Boutique', emoji: '◈' },
  { value: 'futuristic_premium', label: 'Futuristic',         emoji: '◉' },
  { value: 'clean_professional', label: 'Clean Professional', emoji: '▣' },
  { value: 'bold_conversion',    label: 'Bold & Convert',     emoji: '▶' },
]

const INTENSITY_OPTIONS: { value: AnimationIntensity; label: string; desc: string }[] = [
  { value: 'subtle',    label: 'Subtle',    desc: 'Nearly invisible — premium feel' },
  { value: 'balanced',  label: 'Balanced',  desc: 'Smooth, purposeful motion' },
  { value: 'cinematic', label: 'Cinematic', desc: 'Bold, dramatic entrance' },
]

const PERFORMANCE_OPTIONS: { value: AnimationPerformance; label: string }[] = [
  { value: 'fast',     label: 'Fast'     },
  { value: 'balanced', label: 'Balanced' },
  { value: 'premium',  label: 'Premium'  },
]

// ── Minimal inline styles ─────────────────────────────────────────────────────

const S = {
  wrap:      { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.8125rem', color: '#e4e4e7' } as React.CSSProperties,
  label:     { fontSize: '0.6875rem', fontWeight: 600, color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '0.375rem' } as React.CSSProperties,
  card:      { background: '#0d0d0f', borderRadius: '0.5rem', border: '1px solid #27272a', padding: '0.875rem', marginBottom: '0.75rem' } as React.CSSProperties,
  smallText: { fontSize: '0.6875rem', color: '#71717a', lineHeight: 1.45 } as React.CSSProperties,
  accentText:{ fontSize: '0.6875rem', color: '#a78bfa', lineHeight: 1.45 } as React.CSSProperties,
  btn: (bg: string, color = '#f4f4f5'): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
    width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: 'none',
    background: bg, color, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
    transition: 'background 0.15s',
  }),
  row: (gap = '0.5rem'): React.CSSProperties => ({ display: 'flex', gap }),
  chip: (active: boolean): React.CSSProperties => ({
    padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: '1px solid',
    borderColor: active ? '#7c3aed' : '#27272a',
    background: active ? 'rgba(124,58,237,0.15)' : 'transparent',
    color: active ? '#a78bfa' : '#71717a',
    fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
    display: 'flex', alignItems: 'center', gap: '0.375rem',
  }),
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AiPremiumDesignPanel({ tenantId, sectionId, pageId }: Props) {
  const [scope,      setScope]      = useState<AnimationScope>(sectionId ? 'section' : pageId ? 'page' : 'global')
  const [vibe,       setVibe]       = useState<DesiredVibe>('clean_professional')
  const [intensity,  setIntensity]  = useState<AnimationIntensity>('balanced')
  const [perf,       setPerf]       = useState<AnimationPerformance>('balanced')
  const [mobile,     setMobile]     = useState(true)
  const [planState,  setPlanState]  = useState<PanelState>('idle')
  const [planResult, setPlanResult] = useState<PlanResult | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null)

  // Selected animation keys to apply (empty = all)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // Load existing plans on mount
  useEffect(() => {
    void loadLatestPlan()
  }, [tenantId, sectionId, pageId])

  const loadLatestPlan = useCallback(async () => {
    const params = new URLSearchParams({ tenantId })
    if (sectionId) params.set('sectionId', sectionId)
    if (pageId)    params.set('pageId', pageId)
    params.set('status', 'planned')
    try {
      const res  = await fetch(`/api/website/ai/animations/plans?${params}`)
      const data = await res.json() as { plans?: Array<{ id: string; ai_plan: ValidatedAiAnimationPlan }> }
      if (data.plans?.length) {
        setPlanResult({ planId: data.plans[0].id, aiPlan: data.plans[0].ai_plan })
        setPlanState('planned')
      }
    } catch { /* silently ignore */ }
  }, [tenantId, sectionId, pageId])

  const handlePlan = async () => {
    setPlanState('planning')
    setError(null)
    setPlanResult(null)
    setSelectedKeys(new Set())

    try {
      const res = await fetch('/api/website/ai/animations/plan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenantId, pageId: pageId ?? null, sectionId: sectionId ?? null,
          scope, desiredVibe: vibe, intensity, performanceMode: perf,
          includeMobileAnimations: mobile,
        }),
      })
      const data = await res.json() as { plan?: { id: string }; aiPlan?: ValidatedAiAnimationPlan; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to generate plan')

      const planId = data.plan?.id
      const aiPlan = data.aiPlan
      if (!planId || !aiPlan) throw new Error('Unexpected response from AI planner')

      setPlanResult({ planId, aiPlan })
      setPlanState('planned')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setPlanState('error')
    }
  }

  const handleApply = async () => {
    if (!planResult) return
    setPlanState('applying')
    setError(null)

    try {
      const res = await fetch('/api/website/ai/animations/apply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          planId:                planResult.planId,
          applyScope:            scope,
          selectedAnimationKeys: selectedKeys.size > 0 ? [...selectedKeys] : undefined,
        }),
      })
      const data = await res.json() as { ok?: boolean; message?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Apply failed')

      setAppliedMsg(data.message ?? 'Applied!')
      setPlanState('applied')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed.')
      setPlanState('error')
    }
  }

  const handleDisable = async () => {
    setPlanState('disabling')
    setError(null)

    try {
      const res = await fetch('/api/website/ai/animations/disable', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenantId, scope,
          pageId:    pageId ?? null,
          sectionId: sectionId ?? null,
          planId:    planResult?.planId ?? null,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Disable failed')

      setPlanResult(null)
      setPlanState('idle')
      setAppliedMsg('Animations disabled.')
      setTimeout(() => setAppliedMsg(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disable failed.')
      setPlanState('error')
    }
  }

  const toggleKey = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  const isPlanning  = planState === 'planning'
  const isApplying  = planState === 'applying'
  const isDisabling = planState === 'disabling'
  const busy        = isPlanning || isApplying || isDisabling

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '1rem' }}>✦</span>
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#f4f4f5' }}>AI Premium Design</span>
        </div>
        <p style={S.smallText}>
          Generate luxury animations &amp; premium UI styles powered by AI.
        </p>
      </div>

      {/* Scope selector */}
      <div style={{ marginBottom: '1rem' }}>
        <p style={S.label}>Scope</p>
        <div style={S.row()}>
          {(['section', 'page', 'global'] as const).map(s => (
            <button key={s} onClick={() => setScope(s)} style={S.chip(scope === s)}>
              {s === 'section' ? 'Section' : s === 'page' ? 'Page' : 'Entire Site'}
            </button>
          ))}
        </div>
      </div>

      {/* Vibe selector */}
      <div style={{ marginBottom: '1rem' }}>
        <p style={S.label}>Desired Vibe</p>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.375rem' }}>
          {VIBE_OPTIONS.map(v => (
            <button key={v.value} onClick={() => setVibe(v.value)} style={S.chip(vibe === v.value)}>
              <span>{v.emoji}</span> {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Intensity + Performance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <p style={S.label}>Intensity</p>
          {INTENSITY_OPTIONS.map(i => (
            <button
              key={i.value}
              onClick={() => setIntensity(i.value)}
              style={{ ...S.chip(intensity === i.value), width: '100%', marginBottom: '0.25rem', justifyContent: 'flex-start' }}
            >
              {i.label}
            </button>
          ))}
        </div>
        <div>
          <p style={S.label}>Performance</p>
          {PERFORMANCE_OPTIONS.map(p => (
            <button
              key={p.value}
              onClick={() => setPerf(p.value)}
              style={{ ...S.chip(perf === p.value), width: '100%', marginBottom: '0.25rem', justifyContent: 'flex-start' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.625rem 0.75rem', background: '#111113', borderRadius: '0.375rem', border: '1px solid #27272a' }}>
        <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Mobile animations</span>
        <button
          onClick={() => setMobile(m => !m)}
          style={{
            width: '2.25rem', height: '1.25rem', borderRadius: '999px', border: 'none', cursor: 'pointer',
            background: mobile ? '#7c3aed' : '#27272a', position: 'relative', transition: 'background 0.2s',
          }}
          aria-label={mobile ? 'Disable mobile animations' : 'Enable mobile animations'}
        >
          <span style={{
            position: 'absolute', top: '0.125rem',
            left: mobile ? '1.125rem' : '0.125rem',
            width: '1rem', height: '1rem', borderRadius: '50%', background: '#fff',
            transition: 'left 0.2s',
          }} />
        </button>
      </div>

      {/* Reduced motion note (always on) */}
      <div style={{ ...S.smallText, display: 'flex', gap: '0.375rem', alignItems: 'flex-start', marginBottom: '1rem', padding: '0.5rem 0.625rem', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: '0.375rem' }}>
        <span>♿</span>
        <span>Reduced motion preference is always respected.</span>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '0.625rem', borderRadius: '0.375rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '0.75rem', marginBottom: '0.75rem', lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {/* Success */}
      {appliedMsg && (
        <div style={{ padding: '0.5rem', borderRadius: '0.375rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
          {appliedMsg}
        </div>
      )}

      {/* Generate button */}
      <div style={{ marginBottom: '0.75rem' }}>
        <button
          onClick={handlePlan}
          disabled={busy}
          style={S.btn(isPlanning ? '#4c1d95' : '#7c3aed')}
        >
          {isPlanning ? '⏳ Generating Plan…' : planResult ? '↺ Regenerate Plan' : '✦ Generate Premium Design Plan'}
        </button>
      </div>

      {/* Plan result cards */}
      {planResult && planState !== 'planning' && (
        <PlanResultView
          plan={planResult.aiPlan}
          selectedKeys={selectedKeys}
          onToggleKey={toggleKey}
        />
      )}

      {/* Action buttons */}
      {planResult && planState !== 'planning' && (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem', marginTop: '0.75rem' }}>
          <button
            onClick={handleApply}
            disabled={busy}
            style={S.btn(isApplying ? '#1e3a5f' : '#1d4ed8')}
          >
            {isApplying ? '⏳ Applying…' : '▶ Apply to Website'}
          </button>
          <button
            onClick={handleDisable}
            disabled={busy}
            style={S.btn('#1c1c1e', '#71717a')}
          >
            {isDisabling ? '⏳ Disabling…' : '✕ Disable Animations'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Plan result display ────────────────────────────────────────────────────────

function PlanResultView({
  plan,
  selectedKeys,
  onToggleKey,
}: {
  plan:         ValidatedAiAnimationPlan
  selectedKeys: Set<string>
  onToggleKey:  (key: string) => void
}) {
  return (
    <div>
      {/* Summary */}
      <div style={S.card}>
        <p style={S.label}>AI Design Summary</p>
        <p style={{ ...S.smallText, color: '#d4d4d8' }}>{plan.summary}</p>
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const }}>
          <Badge label={plan.globalStyle.visualTier ?? 'premium'} />
          <Badge label={plan.globalStyle.mood ?? 'modern'} />
          <Badge label={plan.globalStyle.surfaceStyle ?? 'soft_shadow'} color='#6d28d9' />
        </div>
      </div>

      {/* Color palette */}
      {plan.globalStyle.recommendedPalette && (
        <div style={S.card}>
          <p style={S.label}>Recommended Palette</p>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' as const }}>
            {Object.entries(plan.globalStyle.recommendedPalette).map(([k, v]) => (
              <div key={k} title={`${k}: ${v}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <div style={{ width: '1rem', height: '1rem', borderRadius: '0.25rem', background: String(v), border: '1px solid #27272a' }} />
                <span style={{ fontSize: '0.625rem', color: '#52525b' }}>{k}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Animations */}
      {plan.animations.length > 0 && (
        <div style={S.card}>
          <p style={S.label}>Animations ({plan.animations.length})</p>
          <p style={{ ...S.smallText, marginBottom: '0.5rem' }}>Click to toggle which animations to apply.</p>
          {plan.animations.map((anim, i) => {
            const key     = anim.targetKey
            const active  = selectedKeys.size === 0 || selectedKeys.has(key)
            return (
              <div
                key={i}
                onClick={() => onToggleKey(key)}
                style={{
                  padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid',
                  borderColor: active ? '#7c3aed40' : '#27272a',
                  background: active ? 'rgba(124,58,237,0.06)' : 'transparent',
                  marginBottom: '0.375rem', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: active ? '#a78bfa' : '#71717a' }}>
                    {anim.targetKey}
                  </span>
                  <span style={{ fontSize: '0.625rem', color: '#52525b' }}>{anim.animationPreset}</span>
                </div>
                <p style={{ ...S.smallText, marginTop: '0.25rem' }}>{anim.reason}</p>
                <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.25rem', flexWrap: 'wrap' as const }}>
                  <Badge label={anim.intensity} />
                  <Badge label={`${anim.durationMs}ms`} />
                  {!anim.mobileEnabled && <Badge label="no mobile" color='#92400e' />}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Section upgrades */}
      {plan.sectionUpgrades.length > 0 && (
        <div style={S.card}>
          <p style={S.label}>Section Upgrades ({plan.sectionUpgrades.length})</p>
          {plan.sectionUpgrades.map((up, i) => (
            <div key={i} style={{ marginBottom: '0.625rem', paddingBottom: '0.625rem', borderBottom: '1px solid #18181b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#d4d4d8' }}>{up.sectionType}</span>
                <Badge label={up.stylePreset} color='#1e3a5f' />
              </div>
              {up.layoutRecommendation && (
                <p style={{ ...S.smallText, marginTop: '0.25rem' }}>{up.layoutRecommendation}</p>
              )}
              <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.25rem', flexWrap: 'wrap' as const }}>
                {up.imageTreatment  !== 'none'     && <Badge label={up.imageTreatment} />}
                {up.buttonTreatment !== 'standard' && <Badge label={up.buttonTreatment} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Performance rules */}
      <div style={S.card}>
        <p style={S.label}>Performance Rules</p>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.25rem' }}>
          <RuleRow label="Reduced motion respected" value={true} />
          <RuleRow label="Avoid heavy on mobile" value={plan.performanceRules.avoidHeavyAnimationsOnMobile} />
          <RuleRow label="Lazy load below fold"  value={plan.performanceRules.lazyLoadBelowFold} />
          <RuleRow label="Max elements / viewport" value={String(plan.performanceRules.maxAnimatedElementsPerViewport)} />
        </div>
      </div>
    </div>
  )
}

function Badge({ label, color = '#27272a' }: { label: string; color?: string }) {
  return (
    <span style={{
      padding: '0.125rem 0.375rem', borderRadius: '999px', background: color,
      fontSize: '0.5625rem', fontWeight: 600, color: '#d4d4d8',
      textTransform: 'uppercase' as const, letterSpacing: '0.03em',
    }}>
      {label}
    </span>
  )
}

function RuleRow({ label, value }: { label: string; value: boolean | string }) {
  const isTrue = value === true || value === 'true'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem' }}>
      <span style={{ color: '#71717a' }}>{label}</span>
      <span style={{ color: typeof value === 'string' ? '#a1a1aa' : isTrue ? '#86efac' : '#fca5a5', fontWeight: 600 }}>
        {typeof value === 'boolean' ? (value ? '✓' : '✗') : value}
      </span>
    </div>
  )
}
