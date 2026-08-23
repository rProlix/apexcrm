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
import { Settings2, Check, AlertCircle, LoaderCircle } from 'lucide-react'
import { saveLayout } from '@/lib/dashboard/saveLayout'
import { DashboardRenderer } from '@/components/dashboard/DashboardRenderer'
import { DraggableWidget } from '@/components/dashboard/DraggableWidget'
import { SuggestedWidgets } from '@/components/dashboard/SuggestedWidgets'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import type { DashboardLayout, WidgetConfig, WidgetData } from '@/lib/dashboard/types'

interface DashboardBuilderProps {
  tenantId: string
  initialLayout: DashboardLayout
  widgetDataMap: Record<string, WidgetData>
  suggestedKeys: string[]
  widgetRegistry: Record<
    string,
    { key: string; label: string; description: string; defaultSection: string }
  >
}

export function DashboardBuilder({
  tenantId,
  initialLayout,
  widgetDataMap,
  suggestedKeys,
  widgetRegistry,
}: DashboardBuilderProps) {
  const [layout, setLayout] = useState<DashboardLayout>(initialLayout)
  const [editMode, setEditMode] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const persist = useCallback(
    (updated: DashboardLayout) => {
      startTransition(async () => {
        setSaveError(null)
        setSaved(false)
        try {
          await saveLayout(tenantId, updated)
          setSaved(true)
          window.setTimeout(() => setSaved(false), 2000)
        } catch (error) {
          setSaveError(
            error instanceof Error ? error.message : 'Layout changes could not be saved.'
          )
        }
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
          s.id === sectionId ? { ...s, widgets: s.widgets.filter((w) => w.id !== widgetId) } : s
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
          id: `w_${key}_${Date.now()}`,
          key,
          type,
        }

        const sections = prev.sections.map((s) =>
          s.id === targetId ? { ...s, widgets: [...s.widgets, newWidget] } : s
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
      <SectionHeader
        eyebrow="Personal workspace"
        title="Performance dashboard"
        description="Arrange the signals you use most. Changes save automatically to this workspace."
        meta={
          <span className="inline-flex items-center gap-1.5" aria-live="polite">
            {isPending ? (
              <>
                <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                Saving
              </>
            ) : saved ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-300" />
                Saved
              </>
            ) : saveError ? (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-red-300" />
                Save failed
              </>
            ) : (
              'Auto-save on'
            )}
          </span>
        }
        action={
          <Button
            type="button"
            variant={editMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setEditMode((value) => !value)}
            aria-pressed={editMode}
          >
            {editMode ? <Check className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
            {editMode ? 'Finish editing' : 'Customize'}
          </Button>
        }
      />

      {saveError && (
        <div className="ui-dashboard-save-error" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{saveError}</span>
        </div>
      )}

      {editMode && (
        <div className="ui-dashboard-editbar" role="status">
          <Settings2 className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-white/80">Layout editing is on</p>
            <p className="mt-0.5 text-xs text-white/40">
              Drag from a widget handle to reorder, or remove a widget from its top-right control.
            </p>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-10">
        {layout.sections.map((section) => {
          const widgetIds = section.widgets.map((w) => w.id)

          return (
            <div key={section.id}>
              <div className="mb-5 flex items-center gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                  {section.title}
                </h3>
                <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
                {editMode && section.widgets.length > 1 && (
                  <span className="rounded-md border border-brand/15 bg-brand/[0.05] px-2 py-1 text-2xs font-medium text-brand/70">
                    Drag to reorder
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
