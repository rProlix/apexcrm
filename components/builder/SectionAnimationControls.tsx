'use client'
// components/builder/SectionAnimationControls.tsx
//
// Per-section animation preset controls inside the builder sidebar.
// Lets the business manually set:
//   - Section animation preset + intensity + duration + delay
//   - Component-level animations: heading, text, button, card, image
// Saves to POST /api/website/sections/[sectionId]/animation (same schema as AnimatedSection reads).

import { useState, useEffect, useCallback } from 'react'

// ── Preset options ─────────────────────────────────────────────────────────────

const ANIMATION_PRESETS = [
  { value: 'none',                  label: 'None (disabled)' },
  { value: 'fade_up',               label: 'Fade Up' },
  { value: 'fade_in',               label: 'Fade In' },
  { value: 'slide_reveal',          label: 'Slide Reveal' },
  { value: 'stagger_cards',         label: 'Stagger Cards' },
  { value: 'parallax_soft',         label: 'Parallax Soft' },
  { value: 'glass_hover',           label: 'Glass Hover' },
  { value: 'premium_card_lift',     label: 'Premium Card Lift' },
  { value: 'image_float',           label: 'Image Float' },
  { value: 'text_reveal',           label: 'Text Reveal' },
  { value: 'hero_cinematic',        label: 'Hero Cinematic' },
  { value: 'magnetic_button',       label: 'Magnetic Button' },
  { value: 'spotlight_sweep',       label: 'Spotlight Sweep' },
  { value: 'number_countup',        label: 'Number Count Up' },
  { value: 'testimonial_carousel',  label: 'Testimonial Carousel' },
  { value: 'faq_smooth_expand',     label: 'FAQ Smooth Expand' },
  { value: 'luxury_reveal',         label: 'Luxury Reveal' },
  { value: 'premium_float',         label: 'Premium Float' },
]

const COMPONENT_PRESETS = [
  { value: '',             label: '— none —' },
  { value: 'fade_up',      label: 'Fade Up' },
  { value: 'fade_in',      label: 'Fade In' },
  { value: 'text_reveal',  label: 'Text Reveal' },
  { value: 'slide_up',     label: 'Slide Up' },
  { value: 'slide_left',   label: 'Slide Left' },
  { value: 'scale_in',     label: 'Scale In' },
  { value: 'blur_reveal',  label: 'Blur Reveal' },
  { value: 'card_lift',    label: 'Card Lift' },
  { value: 'image_float',  label: 'Image Float' },
  { value: 'image_zoom',   label: 'Image Zoom' },
  { value: 'luxury_reveal',label: 'Luxury Reveal' },
  { value: 'magnetic_button', label: 'Magnetic Button' },
]

const INTENSITIES = [
  { value: 'subtle',   label: 'Subtle' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'cinematic',label: 'Cinematic' },
]

// ── Types ──────────────────────────────────────────────────────────────────────

interface ComponentAnimConfig {
  preset?:     string
  intensity?:  string
  durationMs?: number
  delayMs?:    number
}

interface AnimState {
  enabled:    boolean
  preset:     string
  intensity:  string
  durationMs: number
  delayMs:    number
  staggerMs:  number
  heading:    ComponentAnimConfig
  text:       ComponentAnimConfig
  button:     ComponentAnimConfig
  card:       ComponentAnimConfig
  image:      ComponentAnimConfig
}

const DEFAULT_STATE: AnimState = {
  enabled:    true,
  preset:     'fade_up',
  intensity:  'balanced',
  durationMs: 600,
  delayMs:    0,
  staggerMs:  80,
  heading:    {},
  text:       {},
  button:     {},
  card:       {},
  image:      {},
}

// ── Mini form helpers ──────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '0.6875rem', color: '#71717a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {children}
    </span>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value:    string
  onChange: (v: string) => void
  options:  { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width:        '100%',
        padding:      '0.3125rem 0.5rem',
        background:   '#18181b',
        border:       '1px solid #27272a',
        borderRadius: '0.375rem',
        color:        '#f4f4f5',
        fontSize:     '0.75rem',
        cursor:       'pointer',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function NumInput({
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  value:    number
  min:      number
  max:      number
  step:     number
  onChange: (v: number) => void
  suffix?:  string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '70px', padding: '0.3125rem 0.5rem',
          background: '#18181b', border: '1px solid #27272a',
          borderRadius: '0.375rem', color: '#f4f4f5', fontSize: '0.75rem',
        }}
      />
      {suffix && <span style={{ fontSize: '0.6875rem', color: '#52525b' }}>{suffix}</span>}
    </div>
  )
}

function ComponentPresetRow({
  label,
  config,
  onChange,
}: {
  label:    string
  config:   ComponentAnimConfig
  onChange: (c: ComponentAnimConfig) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
      <span style={{ fontSize: '0.6875rem', color: '#71717a', width: 52, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>
        <Select
          value={config.preset ?? ''}
          onChange={preset => onChange({ ...config, preset: preset || undefined })}
          options={COMPONENT_PRESETS}
        />
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SectionAnimationControls({ sectionId }: { sectionId: string }) {
  const [state,    setState]    = useState<AnimState>(DEFAULT_STATE)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)

  // Load current animation config from the API
  useEffect(() => {
    setLoading(true)
    fetch(`/api/website/sections/${sectionId}/animation`)
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        const conf = (data.section as Record<string, unknown>)?.animation_config
        if (conf && typeof conf === 'object') {
          const c = conf as Record<string, unknown>
          const anim    = (c.animation as Record<string, unknown>) ?? {}
          const compAni = (c.componentAnimations as Record<string, unknown>) ?? {}
          setState({
            enabled:    c.enabled !== false,
            preset:     (anim.preset as string)    ?? 'fade_up',
            intensity:  (anim.intensity as string) ?? 'balanced',
            durationMs: (anim.durationMs as number)  ?? 600,
            delayMs:    (anim.delayMs as number)     ?? 0,
            staggerMs:  (anim.staggerMs as number)   ?? 80,
            heading:    (compAni.heading as ComponentAnimConfig) ?? {},
            text:       (compAni.text    as ComponentAnimConfig) ?? {},
            button:     (compAni.button  as ComponentAnimConfig) ?? {},
            card:       (compAni.card    as ComponentAnimConfig) ?? {},
            image:      (compAni.image   as ComponentAnimConfig) ?? {},
          })
        }
      })
      .catch(() => { /* silently ignore — will just show defaults */ })
      .finally(() => setLoading(false))
  }, [sectionId])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const config = {
        v:       1,
        enabled: state.enabled,
        animation: {
          preset:        state.preset === 'none' ? undefined : state.preset,
          intensity:     state.intensity,
          durationMs:    state.durationMs,
          delayMs:       state.delayMs,
          staggerMs:     state.staggerMs,
          mobileEnabled: true,
        },
        componentAnimations: {
          ...(state.heading.preset ? { heading: state.heading } : {}),
          ...(state.text.preset    ? { text:    state.text    } : {}),
          ...(state.button.preset  ? { button:  state.button  } : {}),
          ...(state.card.preset    ? { card:    state.card    } : {}),
          ...(state.image.preset   ? { image:   state.image   } : {}),
        },
      }
      const res = await fetch(`/api/website/sections/${sectionId}/animation`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ animation_config: config }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [sectionId, state])

  if (loading) {
    return <div style={{ color: '#52525b', fontSize: '0.75rem', padding: '0.5rem 0' }}>Loading…</div>
  }

  const f = (label: string, children: React.ReactNode) => (
    <div style={{ marginBottom: '0.625rem' }}>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ marginTop: '0.25rem' }}>{children}</div>
    </div>
  )

  return (
    <div style={{ fontSize: '0.8125rem', color: '#f4f4f5' }}>

      {/* Enable toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Enable animations</span>
        <button
          onClick={() => setState(s => ({ ...s, enabled: !s.enabled }))}
          style={{
            width: 36, height: 20, borderRadius: 10,
            background: state.enabled ? '#7c3aed' : '#27272a',
            border: 'none', cursor: 'pointer', position: 'relative',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: state.enabled ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: '#fff', transition: 'left 0.15s',
          }} />
        </button>
      </div>

      {/* Section preset */}
      {f('Section preset',
        <Select
          value={state.preset}
          onChange={preset => setState(s => ({ ...s, preset }))}
          options={ANIMATION_PRESETS}
        />
      )}

      {/* Intensity */}
      {f('Intensity',
        <Select
          value={state.intensity}
          onChange={intensity => setState(s => ({ ...s, intensity }))}
          options={INTENSITIES}
        />
      )}

      {/* Duration / Delay / Stagger */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <FieldLabel>Duration</FieldLabel>
          <div style={{ marginTop: '0.25rem' }}>
            <NumInput value={state.durationMs} min={100} max={3000} step={100}
              onChange={durationMs => setState(s => ({ ...s, durationMs }))} suffix="ms" />
          </div>
        </div>
        <div>
          <FieldLabel>Delay</FieldLabel>
          <div style={{ marginTop: '0.25rem' }}>
            <NumInput value={state.delayMs} min={0} max={2000} step={50}
              onChange={delayMs => setState(s => ({ ...s, delayMs }))} suffix="ms" />
          </div>
        </div>
        <div>
          <FieldLabel>Stagger</FieldLabel>
          <div style={{ marginTop: '0.25rem' }}>
            <NumInput value={state.staggerMs} min={0} max={800} step={20}
              onChange={staggerMs => setState(s => ({ ...s, staggerMs }))} suffix="ms" />
          </div>
        </div>
      </div>

      {/* Component animations */}
      <div style={{ borderTop: '1px solid #1c1c1e', paddingTop: '0.625rem', marginBottom: '0.625rem' }}>
        <FieldLabel>Component animations</FieldLabel>
        <div style={{ marginTop: '0.5rem' }}>
          <ComponentPresetRow label="Heading" config={state.heading}
            onChange={heading => setState(s => ({ ...s, heading }))} />
          <ComponentPresetRow label="Text" config={state.text}
            onChange={text => setState(s => ({ ...s, text }))} />
          <ComponentPresetRow label="Button" config={state.button}
            onChange={button => setState(s => ({ ...s, button }))} />
          <ComponentPresetRow label="Card" config={state.card}
            onChange={card => setState(s => ({ ...s, card }))} />
          <ComponentPresetRow label="Image" config={state.image}
            onChange={image => setState(s => ({ ...s, image }))} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginBottom: '0.5rem', padding: '0.375rem 0.5rem',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: '0.375rem', fontSize: '0.75rem', color: '#f87171',
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={() => void handleSave()}
        disabled={saving}
        style={{
          width: '100%', padding: '0.5rem', borderRadius: '0.375rem',
          border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
          background: saved ? '#166534' : saving ? '#27272a' : 'rgba(124,58,237,0.8)',
          color: '#fff', fontSize: '0.8125rem', fontWeight: 600,
          transition: 'background 0.15s',
        }}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Animations'}
      </button>
      <p style={{ margin: '0.375rem 0 0', fontSize: '0.6875rem', color: '#52525b', textAlign: 'center' }}>
        Animations apply to the live website immediately after saving.
      </p>
    </div>
  )
}
