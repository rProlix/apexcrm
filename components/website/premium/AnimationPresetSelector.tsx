'use client'
// components/website/premium/AnimationPresetSelector.tsx
// Dropdowns for manually choosing animation/style/treatment presets.

import { ANIMATION_PRESETS, STYLE_PRESETS, IMAGE_TREATMENTS, BUTTON_TREATMENTS } from '@/lib/website/animations/types'

interface SelectProps {
  label:    string
  value:    string
  onChange: (v: string) => void
  options:  { value: string; label: string }[]
  disabled?: boolean
}

function SelectField({ label, value, onChange, options, disabled }: SelectProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-white/80 px-3 py-2.5 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed appearance-none"
        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25em', paddingRight: '2.5rem' }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-zinc-900">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function toLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const PRESET_OPTIONS = [
  { value: 'none', label: 'No Animation' },
  ...ANIMATION_PRESETS.map(p => ({ value: p, label: toLabel(p) })),
]

const STYLE_OPTIONS = [
  { value: 'none', label: 'No Style Preset' },
  ...STYLE_PRESETS.filter(s => s !== 'none').map(s => ({ value: s, label: toLabel(s) })),
]

const IMAGE_TREATMENT_OPTIONS = [
  { value: 'none', label: 'None' },
  ...IMAGE_TREATMENTS.filter(t => t !== 'none').map(t => ({ value: t, label: toLabel(t) })),
]

const BUTTON_TREATMENT_OPTIONS = BUTTON_TREATMENTS.map(b => ({ value: b, label: toLabel(b) }))

const INTENSITY_OPTIONS = [
  { value: 'subtle',    label: 'Subtle — nearly invisible' },
  { value: 'balanced',  label: 'Balanced — smooth & purposeful' },
  { value: 'cinematic', label: 'Cinematic — bold entrance' },
]

export interface ManualConfig {
  preset:          string
  stylePreset:     string
  imageTreatment:  string
  buttonTreatment: string
  intensity:       string
  durationMs:      number
  delayMs:         number
  mobileEnabled:   boolean
}

interface Props {
  config:    ManualConfig
  onChange:  (c: ManualConfig) => void
  disabled?: boolean
}

export function AnimationPresetSelector({ config, onChange, disabled }: Props) {
  const set = <K extends keyof ManualConfig>(k: K, v: ManualConfig[K]) =>
    onChange({ ...config, [k]: v })

  return (
    <div className="space-y-4">
      <SelectField label="Animation Preset" value={config.preset}         onChange={v => set('preset', v)}          options={PRESET_OPTIONS}           disabled={disabled} />
      <SelectField label="Animation Intensity" value={config.intensity}   onChange={v => set('intensity', v)}        options={INTENSITY_OPTIONS}        disabled={disabled || config.preset === 'none'} />
      <SelectField label="Section Style"    value={config.stylePreset}    onChange={v => set('stylePreset', v)}     options={STYLE_OPTIONS}            disabled={disabled} />
      <SelectField label="Image Treatment"  value={config.imageTreatment}  onChange={v => set('imageTreatment', v)} options={IMAGE_TREATMENT_OPTIONS}  disabled={disabled} />
      <SelectField label="Button Treatment" value={config.buttonTreatment} onChange={v => set('buttonTreatment', v)} options={BUTTON_TREATMENT_OPTIONS} disabled={disabled} />

      {config.preset !== 'none' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">Duration (ms)</label>
            <input
              type="number" min={100} max={3000} step={50}
              value={config.durationMs}
              onChange={e => set('durationMs', Math.min(3000, Math.max(100, Number(e.target.value))))}
              disabled={disabled}
              className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-white/80 px-3 py-2.5 focus:outline-none focus:border-amber-500/50 disabled:opacity-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">Delay (ms)</label>
            <input
              type="number" min={0} max={2000} step={50}
              value={config.delayMs}
              onChange={e => set('delayMs', Math.min(2000, Math.max(0, Number(e.target.value))))}
              disabled={disabled}
              className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-white/80 px-3 py-2.5 focus:outline-none focus:border-amber-500/50 disabled:opacity-40"
            />
          </div>
        </div>
      )}

      <label className="flex items-center gap-3 cursor-pointer group">
        <div className="relative flex-shrink-0">
          <input
            type="checkbox"
            checked={config.mobileEnabled}
            onChange={e => set('mobileEnabled', e.target.checked)}
            disabled={disabled}
            className="sr-only"
          />
          <div className={`w-10 h-6 rounded-full transition-colors duration-200 ${config.mobileEnabled ? 'bg-amber-500' : 'bg-white/10'}`} />
          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${config.mobileEnabled ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors">Enable on mobile</span>
      </label>
    </div>
  )
}
