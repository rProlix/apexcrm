'use client'

import { useBuilderStore } from '@/lib/builder/store'
import { uploadSectionImage } from '@/lib/builder/api'
import { useRef } from 'react'
import { Field, Textarea, Select, Toggle } from './FormFields'

interface Props { sectionId: string }

export function HeroEditor({ sectionId }: Props) {
  const { sections, updateSectionContent, tenantId } = useBuilderStore()
  const section = sections.find((s) => s.id === sectionId)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!section) return null
  const c = section.content as Record<string, unknown>

  const set = (key: string, value: unknown) =>
    updateSectionContent(sectionId, { ...c, [key]: value })

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadSectionImage(file, tenantId)
    if (url) set('backgroundImage', url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Field label="Headline">
        <Textarea
          value={(c.headline as string) ?? ''}
          onChange={(v) => set('headline', v)}
          rows={2}
        />
      </Field>

      <Field label="Sub-headline">
        <Textarea
          value={(c.subheadline as string) ?? ''}
          onChange={(v) => set('subheadline', v)}
          rows={2}
        />
      </Field>

      <Field label="Button Label">
        <input
          type="text"
          value={(c.ctaLabel as string) ?? ''}
          onChange={(e) => set('ctaLabel', e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Button Link">
        <input
          type="text"
          value={(c.ctaHref as string) ?? ''}
          onChange={(e) => set('ctaHref', e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Secondary Button Label">
        <input
          type="text"
          value={(c.ctaSecondaryLabel as string) ?? ''}
          onChange={(e) => set('ctaSecondaryLabel', e.target.value)}
          style={inputStyle}
          placeholder="Optional"
        />
      </Field>

      <Field label="Secondary Button Link">
        <input
          type="text"
          value={(c.ctaSecondaryHref as string) ?? ''}
          onChange={(e) => set('ctaSecondaryHref', e.target.value)}
          style={inputStyle}
          placeholder="Optional"
        />
      </Field>

      <Field label="Text Alignment">
        <Select
          value={(c.align as string) ?? 'center'}
          onChange={(v) => set('align', v)}
          options={[
            { value: 'left',   label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right',  label: 'Right' },
          ]}
        />
      </Field>

      <Field label="Background Image">
        {typeof c.backgroundImage === 'string' && c.backgroundImage && (
          <div style={{ marginBottom: '0.5rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.backgroundImage}
              alt="bg"
              style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: '0.375rem' }}
            />
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => fileRef.current?.click()} style={btnStyle}>
            Upload Image
          </button>
          {typeof c.backgroundImage === 'string' && c.backgroundImage && (
            <button onClick={() => set('backgroundImage', '')} style={{ ...btnStyle, color: '#ef4444', borderColor: '#ef4444' }}>
              Remove
            </button>
          )}
        </div>
      </Field>

      {typeof c.backgroundImage === 'string' && c.backgroundImage && (
        <>
          <Toggle
            label="Dark Overlay"
            value={Boolean(c.overlay)}
            onChange={(v) => set('overlay', v)}
          />
          <Field label={`Overlay Opacity: ${c.overlayOpacity ?? 40}%`}>
            <input
              type="range" min={0} max={90} step={5}
              value={(c.overlayOpacity as number) ?? 40}
              onChange={(e) => set('overlayOpacity', Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </Field>
        </>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '0.5rem 0.75rem',
  background:   '#18181b',
  border:       '1px solid #3f3f46',
  borderRadius: '0.5rem',
  color:        '#f4f4f5',
  fontSize:     '0.875rem',
  outline:      'none',
  boxSizing:    'border-box',
}

const btnStyle: React.CSSProperties = {
  padding:      '0.4rem 0.875rem',
  borderRadius: '0.5rem',
  border:       '1px solid #3f3f46',
  background:   '#27272a',
  color:        '#a1a1aa',
  cursor:       'pointer',
  fontSize:     '0.8125rem',
  fontWeight:   500,
}
