'use client'

import { useBuilderStore } from '@/lib/builder/store'
import { Field, Select, Toggle, inputStyle } from './FormFields'

export function BannerEditor({ sectionId }: { sectionId: string }) {
  const { sections, updateSectionContent } = useBuilderStore()
  const section = sections.find((s) => s.id === sectionId)
  if (!section) return null
  const c = section.content as Record<string, unknown>
  const set = (key: string, value: unknown) =>
    updateSectionContent(sectionId, { ...c, [key]: value })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Field label="Banner Text">
        <input type="text" value={(c.text as string) ?? ''} onChange={(e) => set('text', e.target.value)} style={inputStyle} />
      </Field>
      <Field label="CTA Label (optional)">
        <input type="text" value={(c.ctaLabel as string) ?? ''} onChange={(e) => set('ctaLabel', e.target.value)} style={inputStyle} placeholder="e.g. Shop Now" />
      </Field>
      <Field label="CTA Link">
        <input type="text" value={(c.ctaHref as string) ?? ''} onChange={(e) => set('ctaHref', e.target.value)} style={inputStyle} placeholder="/shop" />
      </Field>
      <Field label="Style">
        <Select
          value={(c.variant as string) ?? 'promo'}
          onChange={(v) => set('variant', v)}
          options={[{ value: 'promo', label: 'Promo (Gold)' }, { value: 'info', label: 'Info (Blue)' }, { value: 'warning', label: 'Warning (Amber)' }]}
        />
      </Field>
      <Toggle label="Dismissible" value={Boolean(c.dismissible)} onChange={(v) => set('dismissible', v)} />
    </div>
  )
}
