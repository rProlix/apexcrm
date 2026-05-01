'use client'

// components/builder/EditableSectionList.tsx
// DnD-sortable list of editable sections using @dnd-kit/sortable.
// Handles reordering and delegates to EditableSectionWrapper for each item.

import { useCallback, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useBuilderStore } from '@/lib/builder/store'
import { reorderSections as apiReorder } from '@/lib/builder/api'
import { EditableSectionWrapper } from './EditableSectionWrapper'
import { SectionPicker } from './SectionPicker'
import type { BuilderSection } from '@/lib/builder/types'

export function EditableSectionList() {
  const { sections, reorderSections, setSaveStatus, pageId } = useBuilderStore()
  const [pickerOpen, setPickerOpen] = useState(false)

  const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = sorted.findIndex((s) => s.id === active.id)
      const newIndex = sorted.findIndex((s) => s.id === over.id)
      const reordered = arrayMove(sorted, oldIndex, newIndex).map((s, i) => ({
        ...s,
        sort_order: i,
      }))

      reorderSections(reordered)
      setSaveStatus('saving')

      const ok = await apiReorder(
        reordered.map((s) => ({ id: s.id, sort_order: s.sort_order })),
      )
      setSaveStatus(ok ? 'saved' : 'error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    },
    [sorted, reorderSections, setSaveStatus],
  )

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sorted.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {sorted.map((section) => (
            <SortableItem key={section.id} section={section} />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add section button */}
      <div style={{ padding: '1.5rem', textAlign: 'center' }}>
        <button
          onClick={() => setPickerOpen(true)}
          style={{
            padding:      '0.75rem 2rem',
            borderRadius: '0.875rem',
            border:       '2px dashed rgba(201,168,76,0.4)',
            background:   'transparent',
            color:        '#c9a84c',
            fontWeight:   600,
            fontSize:     '0.9375rem',
            cursor:       'pointer',
            display:      'inline-flex',
            alignItems:   'center',
            gap:          '0.5rem',
            transition:   'all 0.15s',
            fontFamily:   'Inter, system-ui, sans-serif',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(201,168,76,0.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>+</span>
          Add Section
        </button>
      </div>

      {pickerOpen && (
        <SectionPicker
          pageId={pageId}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

// ── Sortable item wrapper ─────────────────────────────────────────────────────

function SortableItem({ section }: { section: BuilderSection }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id })

  const style: React.CSSProperties = {
    transform:  CSS.Transform.toString(transform),
    transition,
    zIndex:     isDragging ? 100 : undefined,
    opacity:    isDragging ? 0.8 : 1,
    boxShadow:  isDragging ? '0 8px 32px rgba(0,0,0,0.3)' : undefined,
  }

  const DragHandle = (
    <div
      {...attributes}
      {...listeners}
      style={{
        width:          24,
        height:         24,
        borderRadius:   '0.25rem',
        background:     '#1a1a1f',
        border:         '1px solid #3f3f46',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        cursor:         'grab',
        color:          '#6b7280',
        fontSize:       '0.75rem',
        userSelect:     'none',
      }}
    >
      ⠿
    </div>
  )

  return (
    <div ref={setNodeRef} style={style}>
      <EditableSectionWrapper
        section={section}
        dragHandle={DragHandle}
      />
    </div>
  )
}
