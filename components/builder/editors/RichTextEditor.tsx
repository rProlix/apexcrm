'use client'

import { useBuilderStore } from '@/lib/builder/store'
import { Field } from './FormFields'

export function RichTextEditor({ sectionId }: { sectionId: string }) {
  const { sections, updateSectionContent } = useBuilderStore()
  const section = sections.find((s) => s.id === sectionId)
  if (!section) return null
  const c = section.content as Record<string, unknown>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Field label="HTML Content">
        <textarea
          value={(c.html as string) ?? ''}
          onChange={(e) =>
            updateSectionContent(sectionId, { ...c, html: e.target.value })
          }
          rows={12}
          spellCheck={false}
          style={{
            width:        '100%',
            padding:      '0.625rem 0.75rem',
            background:   '#18181b',
            border:       '1px solid #3f3f46',
            borderRadius: '0.5rem',
            color:        '#86efac',
            fontSize:     '0.8125rem',
            fontFamily:   '"Fira Code", "Cascadia Code", monospace',
            outline:      'none',
            resize:       'vertical',
            boxSizing:    'border-box',
            lineHeight:   1.7,
          }}
        />
      </Field>
      <p style={{ fontSize: '0.75rem', color: '#52525b', margin: 0 }}>
        Supports HTML tags: &lt;p&gt;, &lt;h1–h6&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;a&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;br&gt;
      </p>
    </div>
  )
}
