'use client'

// Fallback editor for product_grid, contact, image_gallery, and any future types.
// Renders a JSON editor so content is never stuck/uneditable.

import { useState } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { Field } from './FormFields'

export function GenericEditor({ sectionId }: { sectionId: string }) {
  const { sections, updateSectionContent } = useBuilderStore()
  const section = sections.find((s) => s.id === sectionId)
  const [error, setError] = useState('')

  if (!section) return null

  const raw = JSON.stringify(section.content, null, 2)

  const handleChange = (text: string) => {
    try {
      const parsed = JSON.parse(text)
      setError('')
      updateSectionContent(sectionId, parsed)
    } catch {
      setError('Invalid JSON')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <Field label={`${section.section_type} — JSON Editor`}>
        <textarea
          defaultValue={raw}
          onChange={(e) => handleChange(e.target.value)}
          rows={14}
          spellCheck={false}
          style={{
            width:        '100%',
            padding:      '0.625rem 0.75rem',
            background:   '#18181b',
            border:       `1px solid ${error ? '#ef4444' : '#3f3f46'}`,
            borderRadius: '0.5rem',
            color:        '#86efac',
            fontSize:     '0.75rem',
            fontFamily:   '"Fira Code", "Cascadia Code", monospace',
            outline:      'none',
            resize:       'vertical',
            boxSizing:    'border-box',
            lineHeight:   1.7,
          }}
        />
      </Field>
      {error && <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: 0 }}>{error}</p>}
    </div>
  )
}
