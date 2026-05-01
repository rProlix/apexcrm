'use client'

// components/builder/EditorSidebar.tsx
// Right-side panel that opens when a section is selected in edit mode.
// Renders the appropriate section-specific editor form.

import { useBuilderStore } from '@/lib/builder/store'
import { SECTION_TYPE_MAP } from '@/lib/builder/defaults'
import { HeroEditor }          from './editors/HeroEditor'
import { FeatureGridEditor }   from './editors/FeatureGridEditor'
import { CtaEditor }           from './editors/CtaEditor'
import { RichTextEditor }      from './editors/RichTextEditor'
import { BannerEditor }        from './editors/BannerEditor'
import { TestimonialsEditor }  from './editors/TestimonialsEditor'
import { FaqEditor }           from './editors/FaqEditor'
import { AboutEditor }         from './editors/AboutEditor'
import { GenericEditor }       from './editors/GenericEditor'
import { Toggle }              from './editors/FormFields'

const SIDEBAR_WIDTH = 360

export function EditorSidebar() {
  const {
    selectedSectionId, selectSection,
    sections, toggleSectionVisibility,
    saveStatus,
  } = useBuilderStore()

  if (!selectedSectionId) return null

  const section = sections.find((s) => s.id === selectedSectionId)
  if (!section) return null

  const meta = SECTION_TYPE_MAP.get(section.section_type)

  return (
    <div style={{
      position:     'fixed',
      top:          48,   // below EditBar
      right:        0,
      bottom:       0,
      width:        SIDEBAR_WIDTH,
      background:   '#111113',
      borderLeft:   '1px solid #27272a',
      display:      'flex',
      flexDirection: 'column',
      zIndex:       9998,
      fontFamily:   'Inter, system-ui, sans-serif',
      overflowY:    'auto',
    }}>
      {/* Header */}
      <div style={{
        padding:      '1rem 1.25rem',
        borderBottom: '1px solid #27272a',
        display:      'flex',
        alignItems:   'center',
        gap:          '0.75rem',
        position:     'sticky',
        top:          0,
        background:   '#111113',
        zIndex:       1,
      }}>
        <span style={{ fontSize: '1.25rem' }}>{meta?.icon ?? '📄'}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#f4f4f5', fontSize: '0.9375rem' }}>
            {meta?.label ?? section.section_type}
          </p>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#52525b' }}>
            {meta?.description ?? 'Section editor'}
          </p>
        </div>
        <button
          onClick={() => selectSection(null)}
          style={{
            width:        28,
            height:       28,
            borderRadius: '0.375rem',
            border:       '1px solid #3f3f46',
            background:   'transparent',
            color:        '#71717a',
            cursor:       'pointer',
            fontSize:     '1rem',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>
      </div>

      {/* Visibility toggle */}
      <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #27272a' }}>
        <Toggle
          label="Section Visible"
          value={section.is_visible}
          onChange={() => toggleSectionVisibility(section.id)}
        />
      </div>

      {/* Section-specific editor */}
      <div style={{ padding: '1.25rem', flex: 1 }}>
        {renderEditor(section.section_type, section.id)}
      </div>

      {/* Footer */}
      <div style={{
        padding:      '0.75rem 1.25rem',
        borderTop:    '1px solid #27272a',
        position:     'sticky',
        bottom:       0,
        background:   '#111113',
      }}>
        <p style={{
          margin:    0,
          fontSize:  '0.75rem',
          color:     saveStatus === 'saving' ? '#f59e0b'
                    : saveStatus === 'saved'  ? '#22c55e'
                    : saveStatus === 'error'  ? '#ef4444'
                    : '#3f3f46',
          textAlign: 'center',
        }}>
          {saveStatus === 'saving' ? '⏳ Saving changes…'
          : saveStatus === 'saved'  ? '✓ All changes saved'
          : saveStatus === 'error'  ? '✗ Save failed — check connection'
          : ''}
        </p>
      </div>
    </div>
  )
}

function renderEditor(sectionType: string, sectionId: string) {
  switch (sectionType) {
    case 'hero':          return <HeroEditor sectionId={sectionId} />
    case 'feature_grid':  return <FeatureGridEditor sectionId={sectionId} />
    case 'cta':           return <CtaEditor sectionId={sectionId} />
    case 'rich_text':     return <RichTextEditor sectionId={sectionId} />
    case 'banner':        return <BannerEditor sectionId={sectionId} />
    case 'testimonials':  return <TestimonialsEditor sectionId={sectionId} />
    case 'faq':           return <FaqEditor sectionId={sectionId} />
    case 'about':         return <AboutEditor sectionId={sectionId} />
    default:              return <GenericEditor sectionId={sectionId} />
  }
}
