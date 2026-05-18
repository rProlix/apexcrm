'use client'

// components/builder/AiRestyleDrawer.tsx
// Fixed right-side drawer for the AI Restyle Website feature.
// Opened from the "✦ AI Restyle" button in EditBar.
// Lets business owners choose a style direction and apply AI-generated redesigns.

import { useEffect, useRef, useState, useCallback } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import type { WebsiteRestylePlan } from '@/lib/website/ai/restyleTypes'

const DRAWER_WIDTH = 460

type RestyleStep = 'form' | 'loading' | 'preview' | 'applying' | 'done' | 'error'

const STYLE_PRESETS = [
  { value: 'premium_modern',   label: 'Premium Modern' },
  { value: 'luxury_editorial', label: 'Luxury Editorial' },
  { value: 'warm_restaurant',  label: 'Warm Restaurant' },
  { value: 'clean_saas',       label: 'Clean SaaS' },
  { value: 'bold_automotive',  label: 'Bold Automotive' },
  { value: 'calm_medical',     label: 'Calm Medical' },
  { value: 'elegant_law_firm', label: 'Elegant Law Firm' },
  { value: 'beauty_spa',       label: 'Beauty / Spa' },
  { value: 'dark_premium',     label: 'Dark Premium' },
  { value: 'bright_friendly',  label: 'Bright Friendly' },
  { value: 'custom',           label: 'Custom (describe below)' },
]

const LOADING_MESSAGES = [
  'Planning redesign...',
  'Analyzing sections...',
  'Building color palette...',
  'Designing section styles...',
  'Checking contrast...',
  'Optimizing mobile layout...',
  'Building preview...',
]

const APPLYING_MESSAGES = [
  'Applying redesign...',
  'Updating sections...',
  'Saving design system...',
  'Saving checkpoint...',
  'Done!',
]

export function AiRestyleDrawer() {
  const { showRestyleDrawer, setRestyleDrawer, tenantId, pageId } = useBuilderStore()

  // Form state
  const [stylePreset,              setStylePreset]              = useState('premium_modern')
  const [customPrompt,             setCustomPrompt]             = useState('')
  const [intensity,                setIntensity]                = useState<'subtle'|'balanced'|'cinematic'>('balanced')
  const [preserveImages,           setPreserveImages]           = useState(false)
  const [generateImageSuggestions, setGenerateImageSuggestions] = useState(true)
  const [applyAnimations,          setApplyAnimations]          = useState(true)
  const [mobileFirst,              setMobileFirst]              = useState(true)

  // Step / status state
  const [step,            setStep]            = useState<RestyleStep>('form')
  const [loadingMsg,      setLoadingMsg]      = useState(LOADING_MESSAGES[0])
  const [applyingMsg,     setApplyingMsg]     = useState(APPLYING_MESSAGES[0])
  const [errorMsg,        setErrorMsg]        = useState<string | null>(null)
  const [restylePlan,     setRestylePlan]     = useState<WebsiteRestylePlan | null>(null)
  const [runId,           setRunId]           = useState<string | null>(null)
  const [applyResult,     setApplyResult]     = useState<{
    sectionsRestyled: number
    warnings: string[]
    afterVersionId: string | null
  } | null>(null)

  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const applyTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollRef       = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!showRestyleDrawer) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRestyleDrawer(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showRestyleDrawer, setRestyleDrawer])

  // Animate loading message
  useEffect(() => {
    if (step === 'loading') {
      let idx = 0
      loadingTimerRef.current = setInterval(() => {
        idx = (idx + 1) % LOADING_MESSAGES.length
        setLoadingMsg(LOADING_MESSAGES[idx])
      }, 2200)
    } else {
      if (loadingTimerRef.current) {
        clearInterval(loadingTimerRef.current)
        loadingTimerRef.current = null
      }
    }
    return () => {
      if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
    }
  }, [step])

  useEffect(() => {
    if (step === 'applying') {
      let idx = 0
      applyTimerRef.current = setInterval(() => {
        idx = Math.min(idx + 1, APPLYING_MESSAGES.length - 1)
        setApplyingMsg(APPLYING_MESSAGES[idx])
      }, 1400)
    } else {
      if (applyTimerRef.current) {
        clearInterval(applyTimerRef.current)
        applyTimerRef.current = null
      }
    }
    return () => {
      if (applyTimerRef.current) clearInterval(applyTimerRef.current)
    }
  }, [step])

  // Reset step when drawer closes/opens
  useEffect(() => {
    if (!showRestyleDrawer) {
      setTimeout(() => {
        setStep('form')
        setRestylePlan(null)
        setRunId(null)
        setApplyResult(null)
        setErrorMsg(null)
      }, 300)
    }
  }, [showRestyleDrawer])

  const handleGenerate = useCallback(async () => {
    setStep('loading')
    setLoadingMsg(LOADING_MESSAGES[0])
    setErrorMsg(null)

    try {
      const res = await fetch('/api/website/ai/restyle', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          pageId:                  pageId || null,
          stylePreset,
          customPrompt:            customPrompt || null,
          intensity,
          preserveContent:         true,
          preserveImages,
          generateImageSuggestions,
          applyAnimations,
          mobileFirst,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? `Request failed (${res.status})`)
        setStep('error')
        return
      }

      setRestylePlan(data.restylePlan)
      setRunId(data.runId ?? null)
      setStep('preview')
      setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 100)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unexpected error')
      setStep('error')
    }
  }, [tenantId, pageId, stylePreset, customPrompt, intensity, preserveImages, generateImageSuggestions, applyAnimations, mobileFirst])

  const handleApply = useCallback(async () => {
    if (!restylePlan && !runId) return
    setStep('applying')
    setApplyingMsg(APPLYING_MESSAGES[0])

    try {
      const res = await fetch('/api/website/ai/restyle/apply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          runId:       runId ?? undefined,
          restylePlan: restylePlan ?? undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? `Apply failed (${res.status})`)
        setStep('error')
        return
      }

      setApplyResult({
        sectionsRestyled: data.sectionsRestyled ?? 0,
        warnings:         data.warnings ?? [],
        afterVersionId:   data.afterVersionId ?? null,
      })
      setStep('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unexpected error')
      setStep('error')
    }
  }, [tenantId, runId, restylePlan])

  if (!showRestyleDrawer || !tenantId) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setRestyleDrawer(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 99997,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
        }}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-label="AI Restyle Website"
        aria-modal="true"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: DRAWER_WIDTH, zIndex: 99998,
          background: '#0e0e12', borderLeft: '1px solid #2e2e38',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'Inter, system-ui, sans-serif',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.55)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.875rem 1.25rem', borderBottom: '1px solid #27272a',
          flexShrink: 0, background: '#111114',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RestyleIcon />
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                AI Restyle Website
              </div>
              <div style={{ fontSize: '0.6875rem', color: '#52525b', marginTop: 1 }}>
                Redesign visual style · Keep your content
              </div>
            </div>
          </div>
          <button
            onClick={() => setRestyleDrawer(false)}
            title="Close (Esc)"
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: '1px solid #3f3f46', background: 'transparent',
              color: '#71717a', cursor: 'pointer', fontSize: '1.125rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}
        >
          {step === 'form'     && <FormPanel {...{ stylePreset, setStylePreset, customPrompt, setCustomPrompt, intensity, setIntensity, preserveImages, setPreserveImages, generateImageSuggestions, setGenerateImageSuggestions, applyAnimations, setApplyAnimations, mobileFirst, setMobileFirst, onGenerate: handleGenerate }} />}
          {step === 'loading'  && <LoadingPanel message={loadingMsg} />}
          {step === 'preview'  && restylePlan && <PreviewPanel plan={restylePlan} onApply={handleApply} onBack={() => setStep('form')} />}
          {step === 'applying' && <LoadingPanel message={applyingMsg} isApplying />}
          {step === 'done'     && applyResult && <DonePanel result={applyResult} onClose={() => setRestyleDrawer(false)} onNewRestyle={() => setStep('form')} />}
          {step === 'error'    && <ErrorPanel message={errorMsg ?? 'Something went wrong.'} onRetry={() => setStep('form')} />}
        </div>
      </div>
    </>
  )
}

// ── Sub-panels ─────────────────────────────────────────────────────────────────

interface FormPanelProps {
  stylePreset:              string
  setStylePreset:           (v: string) => void
  customPrompt:             string
  setCustomPrompt:          (v: string) => void
  intensity:                'subtle' | 'balanced' | 'cinematic'
  setIntensity:             (v: 'subtle' | 'balanced' | 'cinematic') => void
  preserveImages:           boolean
  setPreserveImages:        (v: boolean) => void
  generateImageSuggestions: boolean
  setGenerateImageSuggestions: (v: boolean) => void
  applyAnimations:          boolean
  setApplyAnimations:       (v: boolean) => void
  mobileFirst:              boolean
  setMobileFirst:           (v: boolean) => void
  onGenerate:               () => void
}

function FormPanel({
  stylePreset, setStylePreset,
  customPrompt, setCustomPrompt,
  intensity, setIntensity,
  preserveImages, setPreserveImages,
  generateImageSuggestions, setGenerateImageSuggestions,
  applyAnimations, setApplyAnimations,
  mobileFirst, setMobileFirst,
  onGenerate,
}: FormPanelProps) {
  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Info banner */}
      <div style={{
        padding: '0.75rem 1rem', borderRadius: 10,
        background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
        fontSize: '0.75rem', color: '#a5b4fc', lineHeight: 1.5,
      }}>
        <strong style={{ color: '#c7d2fe' }}>AI Restyle</strong> transforms your website's visual design while keeping all your existing content, sections, reviews, products, and business information.
      </div>

      {/* Style direction */}
      <Section label="Style Direction">
        <select
          value={stylePreset}
          onChange={(e) => setStylePreset(e.target.value)}
          style={selectStyle}
        >
          {STYLE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </Section>

      {/* Custom prompt */}
      <Section label="Custom Instructions (optional)">
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Example: Make this website feel like a high-end luxury restaurant with warm lighting, smooth section transitions, readable text, curved dividers, premium menu cards, and cinematic image overlays."
          rows={4}
          style={textareaStyle}
        />
      </Section>

      {/* Intensity */}
      <Section label="Redesign Intensity">
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['subtle', 'balanced', 'cinematic'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setIntensity(v)}
              style={{
                flex: 1, padding: '0.5rem',
                borderRadius: 8, border: `1px solid ${intensity === v ? '#6366f1' : '#3f3f46'}`,
                background: intensity === v ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: intensity === v ? '#a5b4fc' : '#71717a',
                fontSize: '0.75rem', fontWeight: intensity === v ? 700 : 400, cursor: 'pointer',
                textTransform: 'capitalize', transition: 'all 0.15s',
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '0.6875rem', color: '#52525b', margin: '0.375rem 0 0' }}>
          {intensity === 'subtle' && 'Refine colors and readability. Minimal visual change.'}
          {intensity === 'balanced' && 'Clear improvement. Updated palette, backgrounds, and typography.'}
          {intensity === 'cinematic' && 'Dramatic full redesign. Premium sections, bold palette, cinematic feel.'}
        </p>
      </Section>

      {/* Toggles */}
      <Section label="Options">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          <Toggle label="Preserve existing images" value={preserveImages}   onChange={setPreserveImages} />
          <Toggle label="Generate image suggestions" value={generateImageSuggestions} onChange={setGenerateImageSuggestions} />
          <Toggle label="Apply section animations"   value={applyAnimations} onChange={setApplyAnimations} />
          <Toggle label="Optimize for mobile first"  value={mobileFirst}     onChange={setMobileFirst} />
        </div>
      </Section>

      {/* Note */}
      <div style={{ fontSize: '0.6875rem', color: '#52525b', lineHeight: 1.5 }}>
        Content preservation is always ON. AI Restyle will not delete sections, reviews, products, FAQs, or any business data. A version checkpoint is saved before applying so you can undo anytime.
      </div>

      {/* Generate button */}
      <button
        onClick={onGenerate}
        style={{
          padding: '0.75rem', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff', fontWeight: 700, fontSize: '0.875rem',
          cursor: 'pointer', letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          transition: 'opacity 0.15s',
        }}
      >
        <RestyleIcon size={14} />
        Generate Restyle Preview
      </button>
    </div>
  )
}

function LoadingPanel({ message, isApplying = false }: { message: string; isApplying?: boolean }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '3rem 2rem', gap: '1.5rem', minHeight: 320,
    }}>
      <Spinner color={isApplying ? '#22c55e' : '#6366f1'} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#f4f4f5', marginBottom: '0.375rem' }}>
          {message}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#52525b' }}>
          {isApplying ? 'Applying your new design…' : 'AI is designing your new website style…'}
        </div>
      </div>
    </div>
  )
}

function PreviewPanel({
  plan, onApply, onBack,
}: {
  plan: WebsiteRestylePlan
  onApply: () => void
  onBack: () => void
}) {
  const p = plan.designSystem?.palette
  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Summary */}
      <div style={{
        padding: '1rem', borderRadius: 10,
        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
        fontSize: '0.8125rem', color: '#86efac', lineHeight: 1.6,
      }}>
        <div style={{ fontWeight: 700, color: '#4ade80', marginBottom: '0.375rem' }}>Restyle Preview Ready</div>
        {plan.summary}
      </div>

      {/* Palette preview */}
      {p && (
        <Section label="New Color Palette">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Primary',    color: p.primary    },
              { label: 'Secondary',  color: p.secondary  },
              { label: 'Accent',     color: p.accent     },
              { label: 'Background', color: p.background },
              { label: 'Surface',    color: p.surface    },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: color, border: '1px solid #3f3f46',
                  flexShrink: 0,
                }} title={color} />
                <span style={{ fontSize: '0.625rem', color: '#52525b', textAlign: 'center' }}>{label}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Typography */}
      {plan.designSystem?.typography && (
        <Section label="Typography">
          <div style={{ fontSize: '0.75rem', color: '#a1a1aa', lineHeight: 1.6 }}>
            <div>Headings: <span style={{ color: '#f4f4f5', fontWeight: 600 }}>{plan.designSystem.typography.headingFontStack?.split(',')[0] ?? 'System'}</span></div>
            <div>Body: <span style={{ color: '#f4f4f5' }}>{plan.designSystem.typography.bodyFontStack?.split(',')[0] ?? 'System'}</span></div>
            <div>Category: <span style={{ color: '#f4f4f5', textTransform: 'capitalize' }}>{plan.designSystem.typography.headingFontCategory}</span></div>
          </div>
        </Section>
      )}

      {/* Section upgrades summary */}
      <Section label={`Section Designs (${plan.sectionUpgrades.length} sections)`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 200, overflowY: 'auto' }}>
          {plan.sectionUpgrades.slice(0, 12).map((u, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0.625rem', borderRadius: 8,
              background: '#18181b', border: '1px solid #27272a',
              fontSize: '0.75rem',
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: u.design.backgroundValue?.startsWith('#')
                  ? u.design.backgroundValue
                  : '#6366f1',
              }} />
              <span style={{ color: '#d4d4d8', textTransform: 'capitalize' }}>
                {u.sectionType.replace(/_/g, ' ')}
              </span>
              <span style={{ color: '#52525b', marginLeft: 'auto', textTransform: 'capitalize' }}>
                {u.design.backgroundType}
              </span>
            </div>
          ))}
          {plan.sectionUpgrades.length > 12 && (
            <div style={{ fontSize: '0.6875rem', color: '#52525b', textAlign: 'center' }}>
              +{plan.sectionUpgrades.length - 12} more sections
            </div>
          )}
        </div>
      </Section>

      {/* Contrast/mobile fixes */}
      {(plan.contrastFixes.length > 0 || plan.mobileFixes.length > 0) && (
        <Section label="Fixes Applied">
          <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
            {plan.contrastFixes.length > 0 && (
              <div>✓ {plan.contrastFixes.length} contrast issue{plan.contrastFixes.length !== 1 ? 's' : ''} corrected</div>
            )}
            {plan.mobileFixes.length > 0 && (
              <div>✓ {plan.mobileFixes.length} mobile layout fix{plan.mobileFixes.length !== 1 ? 'es' : ''} applied</div>
            )}
          </div>
        </Section>
      )}

      {/* Warnings */}
      {plan.warnings.length > 0 && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: 8,
          background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)',
          fontSize: '0.75rem', color: '#fde047',
        }}>
          {plan.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {/* Info */}
      <div style={{ fontSize: '0.6875rem', color: '#52525b', lineHeight: 1.5 }}>
        A version checkpoint will be saved before applying. You can always restore the previous design from Version History.
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        <button
          onClick={onApply}
          style={{
            padding: '0.75rem', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #059669, #0d9488)',
            color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}
        >
          ✓ Apply Restyle to Website
        </button>
        <button
          onClick={onBack}
          style={{
            padding: '0.625rem', borderRadius: 8, border: '1px solid #3f3f46',
            background: 'transparent', color: '#71717a', fontSize: '0.8125rem',
            cursor: 'pointer', transition: 'color 0.15s',
          }}
        >
          ← Adjust Settings
        </button>
      </div>
    </div>
  )
}

function DonePanel({
  result, onClose, onNewRestyle,
}: {
  result: { sectionsRestyled: number; warnings: string[]; afterVersionId: string | null }
  onClose: () => void
  onNewRestyle: () => void
}) {
  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{
        padding: '1rem', borderRadius: 10,
        background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#4ade80', marginBottom: '0.25rem' }}>
          Restyle Applied!
        </div>
        <div style={{ fontSize: '0.8125rem', color: '#86efac' }}>
          {result.sectionsRestyled} section{result.sectionsRestyled !== 1 ? 's' : ''} redesigned
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div style={{
          padding: '0.75rem', borderRadius: 8,
          background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)',
          fontSize: '0.75rem', color: '#fde047',
        }}>
          {result.warnings.slice(0, 3).map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      <div style={{ fontSize: '0.75rem', color: '#a1a1aa', lineHeight: 1.6 }}>
        <div>✓ Design checkpoint saved — use Version History to undo</div>
        <div>✓ Reload the page to see the full redesigned site</div>
        <div>✓ Publish when you're happy with the result</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.75rem', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer',
          }}
        >
          Reload to See Redesign
        </button>
        <button
          onClick={onNewRestyle}
          style={{
            padding: '0.625rem', borderRadius: 8, border: '1px solid #3f3f46',
            background: 'transparent', color: '#71717a', fontSize: '0.8125rem', cursor: 'pointer',
          }}
        >
          Try Another Style
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '0.625rem', borderRadius: 8, border: '1px solid #3f3f46',
            background: 'transparent', color: '#71717a', fontSize: '0.8125rem', cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{
        padding: '1rem', borderRadius: 10,
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
      }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f87171', marginBottom: '0.5rem' }}>
          Restyle Failed
        </div>
        <div style={{ fontSize: '0.8125rem', color: '#fca5a5', lineHeight: 1.5 }}>{message}</div>
      </div>
      <button
        onClick={onRetry}
        style={{
          padding: '0.75rem', borderRadius: 10, border: '1px solid #3f3f46',
          background: 'transparent', color: '#a1a1aa', fontSize: '0.875rem',
          fontWeight: 600, cursor: 'pointer',
        }}
      >
        ← Back to Settings
      </button>
    </div>
  )
}

// ── Helper components ──────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', padding: '0.375rem 0',
      }}
    >
      <span style={{ fontSize: '0.8125rem', color: '#a1a1aa' }}>{label}</span>
      <div style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative',
        background: value ? '#6366f1' : '#3f3f46',
        transition: 'background 0.15s', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 3,
          left: value ? 19 : 3,
          width: 14, height: 14, borderRadius: '50%',
          background: '#fff', transition: 'left 0.15s',
        }} />
      </div>
    </div>
  )
}

function Spinner({ color = '#6366f1' }: { color?: string }) {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: '50%',
      border: `3px solid ${color}33`,
      borderTopColor: color,
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function RestyleIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
    </svg>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '0.625rem 0.75rem',
  borderRadius: 8, border: '1px solid #3f3f46',
  background: '#18181b', color: '#f4f4f5',
  fontSize: '0.8125rem', cursor: 'pointer',
  appearance: 'none',
}

const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '0.625rem 0.75rem',
  borderRadius: 8, border: '1px solid #3f3f46',
  background: '#18181b', color: '#f4f4f5',
  fontSize: '0.8125rem', lineHeight: 1.6,
  resize: 'vertical', fontFamily: 'inherit',
  boxSizing: 'border-box',
}
