'use client'

// components/builder/SectionPicker.tsx
// Modal overlay that shows all available section types.
// Clicking a type creates a new section and adds it to the page.

import { useState } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { createSection } from '@/lib/builder/api'
import { SECTION_TYPES } from '@/lib/builder/defaults'

interface Props {
  pageId:  string
  onClose: () => void
}

export function SectionPicker({ pageId, onClose }: Props) {
  const { sections, addSection, selectSection } = useBuilderStore()
  const [adding, setAdding] = useState<string | null>(null)

  const handleAdd = async (type: string, defaultContent: Record<string, unknown>) => {
    if (adding) return
    setAdding(type)

    const sortOrder = sections.length > 0
      ? Math.max(...sections.map((s) => s.sort_order)) + 1
      : 0

    const created = await createSection({
      pageId,
      sectionType:  type,
      content:      defaultContent,
      sort_order:   sortOrder,
    })

    if (created) {
      addSection(created)
      selectSection(created.id)
    }

    setAdding(null)
    onClose()
  }

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.7)',
        zIndex:         99990,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '1rem',
        backdropFilter: 'blur(4px)',
      }}
    >
      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:   '#111113',
          border:       '1px solid #27272a',
          borderRadius: '1rem',
          width:        '100%',
          maxWidth:     680,
          maxHeight:    '80vh',
          overflow:     'hidden',
          display:      'flex',
          flexDirection: 'column',
          fontFamily:   'Inter, system-ui, sans-serif',
        }}
      >
        {/* Modal header */}
        <div style={{
          padding:      '1.25rem 1.5rem',
          borderBottom: '1px solid #27272a',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, color: '#f4f4f5', fontWeight: 700, fontSize: '1.0625rem' }}>
              Add Section
            </h2>
            <p style={{ margin: '0.25rem 0 0', color: '#52525b', fontSize: '0.8125rem' }}>
              Choose a section type to add to your page
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width:        32,
              height:       32,
              borderRadius: '0.5rem',
              border:       '1px solid #3f3f46',
              background:   'transparent',
              color:        '#71717a',
              cursor:       'pointer',
              fontSize:     '1.125rem',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Section type grid */}
        <div style={{
          padding:     '1.25rem 1.5rem',
          overflowY:   'auto',
          display:     'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap:         '0.75rem',
        }}>
          {SECTION_TYPES.map((def) => {
            const isAdding = adding === def.type
            return (
              <button
                key={def.type}
                onClick={() => handleAdd(def.type, def.defaultContent)}
                disabled={!!adding}
                style={{
                  background:   isAdding ? '#c9a84c22' : '#18181b',
                  border:       `1px solid ${isAdding ? '#c9a84c' : '#27272a'}`,
                  borderRadius: '0.75rem',
                  padding:      '1rem',
                  cursor:       adding ? 'not-allowed' : 'pointer',
                  textAlign:    'left',
                  opacity:      adding && !isAdding ? 0.5 : 1,
                  transition:   'all 0.15s',
                  display:      'flex',
                  flexDirection: 'column',
                  gap:          '0.5rem',
                }}
                onMouseEnter={(e) => {
                  if (!adding) {
                    e.currentTarget.style.borderColor = '#c9a84c'
                    e.currentTarget.style.background  = '#c9a84c0a'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAdding) {
                    e.currentTarget.style.borderColor = '#27272a'
                    e.currentTarget.style.background  = '#18181b'
                  }
                }}
              >
                <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>
                  {isAdding ? '⏳' : def.icon}
                </span>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, color: '#f4f4f5', fontSize: '0.875rem' }}>
                    {def.label}
                  </p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#52525b', lineHeight: 1.4 }}>
                    {def.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
