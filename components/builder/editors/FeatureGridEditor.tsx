'use client'

import type React from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { Field, Select, inputStyle } from './FormFields'

interface FeatureItem { title: string; description: string; icon?: string }

export function FeatureGridEditor({ sectionId }: { sectionId: string }) {
  const { sections, updateSectionContent } = useBuilderStore()
  const section = sections.find((s) => s.id === sectionId)
  if (!section) return null
  const c = section.content as Record<string, unknown>
  const items = ((c.items ?? []) as FeatureItem[])
  const set = (key: string, value: unknown) =>
    updateSectionContent(sectionId, { ...c, [key]: value })
  const setItem = (i: number, patch: Partial<FeatureItem>) => {
    const next = items.map((item, idx) => idx === i ? { ...item, ...patch } : item)
    set('items', next)
  }
  const addItem = () => set('items', [...items, { title: 'New Feature', description: '' }])
  const removeItem = (i: number) => set('items', items.filter((_, idx) => idx !== i))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Field label="Headline">
        <input type="text" value={(c.headline as string) ?? ''} onChange={(e) => set('headline', e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Subtitle">
        <input type="text" value={(c.subtitle as string) ?? ''} onChange={(e) => set('subtitle', e.target.value)} style={inputStyle} placeholder="Optional" />
      </Field>
      <Field label="Columns">
        <Select
          value={String(c.columns ?? 3)}
          onChange={(v) => set('columns', Number(v))}
          options={[{ value: '2', label: '2 columns' }, { value: '3', label: '3 columns' }, { value: '4', label: '4 columns' }]}
        />
      </Field>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Items</span>
          <button onClick={addItem} style={{ padding: '0.25rem 0.625rem', background: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.375rem', color: '#a1a1aa', cursor: 'pointer', fontSize: '0.75rem' }}>+ Add</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map((item, i) => (
            <div key={i} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '0.5rem', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#52525b' }}>Item {i + 1}</span>
                <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.875rem' }}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input type="text" value={item.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Title" style={{ ...inputStyle, marginBottom: 0 }} />
                <textarea value={item.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Description" rows={2} style={{ ...(inputStyle as React.CSSProperties), resize: 'vertical', lineHeight: 1.5 }} />
                <input type="text" value={item.icon ?? ''} onChange={(e) => setItem(i, { icon: e.target.value })} placeholder="Icon emoji (optional)" style={{ ...inputStyle, marginBottom: 0 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
