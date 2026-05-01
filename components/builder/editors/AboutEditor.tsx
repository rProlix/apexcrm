'use client'

import { useBuilderStore } from '@/lib/builder/store'
import { Field, Textarea, inputStyle } from './FormFields'
import { uploadSectionImage } from '@/lib/builder/api'
import { useRef } from 'react'

export function AboutEditor({ sectionId }: { sectionId: string }) {
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
    if (url) set('image', url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Field label="Headline">
        <input type="text" value={(c.headline as string) ?? ''} onChange={(e) => set('headline', e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Body Text">
        <Textarea value={(c.body as string) ?? ''} onChange={(v) => set('body', v)} rows={6} />
      </Field>
      <Field label="Image">
        {typeof c.image === 'string' && c.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: '0.375rem', marginBottom: '0.5rem' }} />
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => fileRef.current?.click()} style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', border: '1px solid #3f3f46', background: '#27272a', color: '#a1a1aa', cursor: 'pointer', fontSize: '0.8125rem' }}>Upload Image</button>
          {typeof c.image === 'string' && c.image && <button onClick={() => set('image', '')} style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '0.8125rem' }}>Remove</button>}
        </div>
      </Field>
    </div>
  )
}
