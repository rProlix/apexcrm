'use client'

import { useBuilderStore } from '@/lib/builder/store'
import { Field, Textarea, Select, inputStyle } from './FormFields'

export function CtaEditor({ sectionId }: { sectionId: string }) {
  const { sections, updateSectionContent } = useBuilderStore()
  const section = sections.find((s) => s.id === sectionId)
  if (!section) return null
  const c = section.content as Record<string, unknown>
  const set = (key: string, value: unknown) =>
    updateSectionContent(sectionId, { ...c, [key]: value })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Field label="Headline">
        <input type="text" value={(c.headline as string) ?? ''} onChange={(e) => set('headline', e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Body Text">
        <Textarea value={(c.body as string) ?? ''} onChange={(v) => set('body', v)} rows={3} />
      </Field>
      <Field label="Button Label">
        <input type="text" value={(c.ctaLabel as string) ?? ''} onChange={(e) => set('ctaLabel', e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Button Link">
        <input type="text" value={(c.ctaHref as string) ?? ''} onChange={(e) => set('ctaHref', e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Alignment">
        <Select
          value={(c.align as string) ?? 'center'}
          onChange={(v) => set('align', v)}
          options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]}
        />
      </Field>
    </div>
  )
}
