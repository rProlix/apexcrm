'use client'

import { useBuilderStore } from '@/lib/builder/store'
import { Field, inputStyle } from './FormFields'
import type React from 'react'

interface FaqItem { question: string; answer: string }

export function FaqEditor({ sectionId }: { sectionId: string }) {
  const { sections, updateSectionContent } = useBuilderStore()
  const section = sections.find((s) => s.id === sectionId)
  if (!section) return null
  const c = section.content as Record<string, unknown>
  const items = ((c.items ?? []) as FaqItem[])
  const set = (key: string, value: unknown) =>
    updateSectionContent(sectionId, { ...c, [key]: value })
  const setItem = (i: number, patch: Partial<FaqItem>) =>
    set('items', items.map((item, idx) => idx === i ? { ...item, ...patch } : item))
  const addItem = () => set('items', [...items, { question: 'New Question?', answer: 'Answer here.' }])
  const removeItem = (i: number) => set('items', items.filter((_, idx) => idx !== i))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Field label="Section Headline">
        <input type="text" value={(c.headline as string) ?? ''} onChange={(e) => set('headline', e.target.value)} style={inputStyle} />
      </Field>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Questions</span>
          <button onClick={addItem} style={{ padding: '0.25rem 0.625rem', background: '#27272a', border: '1px solid #3f3f46', borderRadius: '0.375rem', color: '#a1a1aa', cursor: 'pointer', fontSize: '0.75rem' }}>+ Add</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map((item, i) => (
            <div key={i} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '0.5rem', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#52525b' }}>Q{i + 1}</span>
                <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.875rem' }}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input type="text" value={item.question} onChange={(e) => setItem(i, { question: e.target.value })} placeholder="Question" style={inputStyle} />
                <textarea value={item.answer} onChange={(e) => setItem(i, { answer: e.target.value })} placeholder="Answer" rows={3} style={{ ...(inputStyle as React.CSSProperties), resize: 'vertical', lineHeight: 1.5 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
