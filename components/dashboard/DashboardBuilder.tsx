'use client'

import { useState, useTransition, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { Settings2, Check, Loader2 } from 'lucide-react'
import { saveLayout } from '@/lib/dashboard/saveLayout'
import { DashboardRenderer } from '@/components/dashboard/DashboardRenderer'
import { DraggableWidget } from '@/components/dashboard/DraggableWidget'
import { SuggestedWidgets } from '@/components/dashboard/SuggestedWidgets'
import { cn } from '@/lib/utils'
import type { DashboardLayout, WidgetConfig, WidgetData, WidgetDefinition } from '@/lib/dashboard/types'

interface DashboardBuilderProps {
  tenantId:        string
  initialLayout:   DashboardLayout
  widgetDataMap:   Record<string, WidgetData>
  suggestedKeys:   string[]
  widgetRegistry:  Record<string, { key: string; label: string; description: string; defaultSection: string }>
}

export function DashboardBuilder({
  tenantId,
  initialLayout,
  widgetDataMap,
  suggestedKeys,
  widgetRegistry,
}: DashboardBuilderProps) {
  const [layout,    setLayout]    = useState<DashboardLayout>(initialLayout)
  const [editMode,  setEditMode]  = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor,  { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const persist = useCallback(
    (updated: DashboardLayout) => {
      startTransition(async () => {
        await saveLayout(tenantId, updated)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      })
    },
    [tenantId]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent, sectionId: string) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      setLayout((prev) => {
        const sections = prev.sections.map((section) => {
          if (section.id !== sectionId) return section
          const oldIdx = section.widgets.findIndex((w) => w.id === active.id)
          const newIdx = section.widgets.findIndex((w) => w.id === over.id)
          if (oldIdx === -1 || newIdx === -1) return section
          return { ...section, widgets: arrayMove(section.widgets, oldIdx, newIdx) }
        })
        const updated = { ...prev, sections }
        persist(updated)
        return updated
      })
    },
    [persist]
  )

  const handleRemove = useCallback(
    (sectionId: string, widgetId: string) => {
      setLayout((prev) => {
        const sections = prev.sections.map((s) =>
          s.id === sectionId
            ? { ...s, widgets: s.widgets.filter((w) => w.id !== widgetId) }
            : s
        )
        const updated = { ...prev, sections }
        persist(updated)
        return updated
      })
    },
    [persist]
  )

  const handleAddWidget = useCallback(
    (key: string, type: WidgetConfig['type'], defaultSection: string) => {
      setLayout((prev) => {
        // Avoid duplicates
        const alreadyExists = prev.sections.some((s) => s.widgets.some((w) => w.key === key))
        if (alreadyExists) return prev

        const targetId = defaultSection || 'operations'
        const newWidget: WidgetConfig = {
          id:   `w_${key}_${Date.now()}`,
          key,
          type,
        }

        const sections = prev.sections.map((s) =>
          s.id === targetId
            ? { ...s, widgets: [...s.widgets, newWidget] }
            : s
        )

        // If no section matched, append to first section
        const updated = sections.some((s) => s.id === targetId)
          ? { ...prev, sections }
          : {
              ...prev,
              sections: prev.sections.map((s, i) =>
                i === 0 ? { ...s, widgets: [...s.widgets, newWidget] } : s
              ),
            }

        persist(updated)
        return updated
      })
    },
    [persist]
  )

  const currentKeys = new Set(layout.sections.flatMap((s) => s.widgets.map((w) => w.key)))
  const filteredSuggestions = suggestedKeys.filter((k) => !currentKeys.has(k))

  return (
    <div className="space-y-8">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-white/25 uppercase tracking-widest">
          Dashboard
        </h2>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          {isPending && !saved && (
            <span className="flex items-center gap-1.5 text-xs text-white/30">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          )}
          <button
            onClick={() => setEditMode((v) => !v)}
            className={cn(
              'flex items-center gap-2 h-8 px-3 rounded-xl text-xs font-medium border',
              'transition-all duration-150',
              editMode
                ? 'bg-gold-500/15 border-gold-500/30 text-gold-400 shadow-glow-gold'
                : 'bg-graphite-700 border-graphite-500 text-white/50 hover:text-white'
            )}
          >
            <Settings2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            {editMode ? 'Done editing' : 'Edit Layout'}
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-10">
        {layout.sections.map((section) => {
          const widgetIds = section.widgets.map((w) => w.id)

          return (
            <div key={section.id}>
              <div className="flex items-center gap-3 mb-5">
                <h3 className="text-xs font-semibold text-white/35 uppercase tracking-widest">
                  {section.title}
                </h3>
                <div className="flex-1 h-px bg-white/5" />
                {editMode && section.widgets.length > 1 && (
                  <span className="text-2xs text-gold-400/50 border border-gold-500/20 rounded px-1.5 py-0.5">
                    drag to reorder
                  </span>
                )}
              </div>

              {section.widgets.length === 0 ? (
                editMode ? (
                  <div className="rounded-2xl border-2 border-dashed border-white/8 p-8 text-center text-xs text-white/20">
                    No widgets — add one from suggestions below
                  </div>
                ) : null
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => handleDragEnd(e, section.id)}
                >
                  <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
                    <DashboardRenderer
                      layout={{ sections: [section] }}
                      widgetDataMap={widgetDataMap}
                      renderWidget={(wc, content) => (
                        <DraggableWidget
                          key={wc.id}
                          id={wc.id}
                          editMode={editMode}
                          onRemove={editMode ? () => handleRemove(section.id, wc.id) : undefined}
                        >
                          {content}
                        </DraggableWidget>
                      )}
                    />
                  </SortableContext>
                </DndContext>
              )}
            </div>
          )
        })}
      </div>

      {/* Suggested widgets */}
      {filteredSuggestions.length > 0 && (
        <SuggestedWidgets
          widgetKeys={filteredSuggestions}
          widgetRegistry={widgetRegistry}
          onAdd={handleAddWidget}
        />
      )}
    </div>
  )
}
