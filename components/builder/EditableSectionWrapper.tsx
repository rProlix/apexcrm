'use client'

// components/builder/EditableSectionWrapper.tsx
// Wraps a single section with hover/select overlays and edit controls.
// Uses CSS variables so it respects the site theme.

import { useState } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { deleteSection } from '@/lib/builder/api'
import { ClientSectionRenderer } from './ClientSectionRenderer'
import type { BuilderSection } from '@/lib/builder/types'

interface Props {
  section:     BuilderSection
  dragHandle?: React.ReactNode
}

export function EditableSectionWrapper({ section, dragHandle }: Props) {
  const { selectedSectionId, selectSection, removeSection, toggleSectionVisibility } =
    useBuilderStore()

  const [hovered, setHovered] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isSelected = selectedSectionId === section.id
  const isHidden   = !section.is_visible

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this section?')) return
    setDeleting(true)
    const ok = await deleteSection(section.id)
    if (ok) {
      removeSection(section.id)
    }
    setDeleting(false)
  }

  const handleToggleVisibility = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleSectionVisibility(section.id)
  }

  return (
    <div
      onClick={() => selectSection(section.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position:   'relative',
        cursor:     'pointer',
        outline:    isSelected
          ? '2px solid #c9a84c'
          : hovered
          ? '2px solid rgba(201,168,76,0.4)'
          : '2px solid transparent',
        outlineOffset: '-2px',
        opacity:    isHidden ? 0.4 : 1,
        transition: 'outline 0.1s, opacity 0.2s',
      }}
    >
      {/* Section label chip — appears on hover/select */}
      {(hovered || isSelected) && (
        <div style={{
          position:       'absolute',
          top:            8,
          left:           8,
          zIndex:         1000,
          display:        'flex',
          alignItems:     'center',
          gap:            '0.375rem',
          pointerEvents:  'none',
        }}>
          {/* Drag handle injected by parent */}
          {dragHandle && (
            <div style={{ pointerEvents: 'all', cursor: 'grab' }}>
              {dragHandle}
            </div>
          )}
          <span style={{
            background:   '#1a1a1f',
            border:       '1px solid #3f3f46',
            color:        '#c9a84c',
            padding:      '0.1875rem 0.5rem',
            borderRadius: '0.375rem',
            fontSize:     '0.6875rem',
            fontWeight:   700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            fontFamily:   'Inter, system-ui, sans-serif',
          }}>
            {section.section_type.replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Action buttons — top right */}
      {(hovered || isSelected) && (
        <div
          style={{
            position:      'absolute',
            top:           8,
            right:         8,
            zIndex:        1001,
            display:       'flex',
            alignItems:    'center',
            gap:           '0.25rem',
            pointerEvents: 'all',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Edit button */}
          <ActionButton
            onClick={() => selectSection(section.id)}
            title="Edit section"
            active={isSelected}
          >
            ✏️
          </ActionButton>

          {/* Visibility toggle */}
          <ActionButton
            onClick={handleToggleVisibility}
            title={isHidden ? 'Show section' : 'Hide section'}
          >
            {isHidden ? '👁️' : '🙈'}
          </ActionButton>

          {/* Delete */}
          <ActionButton
            onClick={handleDelete}
            title="Delete section"
            danger
            disabled={deleting}
          >
            {deleting ? '…' : '🗑️'}
          </ActionButton>
        </div>
      )}

      {/* The actual section content */}
      <ClientSectionRenderer section={section} />
    </div>
  )
}

function ActionButton({
  children, onClick, title, active, danger, disabled,
}: {
  children:  React.ReactNode
  onClick:   (e: React.MouseEvent) => void
  title?:    string
  active?:   boolean
  danger?:   boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        width:        28,
        height:       28,
        borderRadius: '0.375rem',
        border:       `1px solid ${active ? '#c9a84c' : danger ? '#ef4444' : '#3f3f46'}`,
        background:   active ? '#c9a84c22' : danger ? '#ef444422' : '#1a1a1f',
        cursor:       disabled ? 'not-allowed' : 'pointer',
        fontSize:     '0.875rem',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        padding:      0,
        transition:   'all 0.1s',
      }}
    >
      {children}
    </button>
  )
}
