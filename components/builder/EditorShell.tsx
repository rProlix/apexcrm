'use client'

// components/builder/EditorShell.tsx
// The main client-side orchestrator for the in-site visual editor.
//
// Rendered by [[...slug]]/page.tsx when the visitor is an owner or admin.
// It wraps the site content and:
//   - Initialises the Zustand store with section data
//   - Renders the floating EditBar
//   - When edit mode is OFF → renders sections read-only (ClientSectionRenderer)
//   - When edit mode is ON  → renders EditableSectionList (DnD + overlays)

import { useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useBuilderStore } from '@/lib/builder/store'
import { saveSection } from '@/lib/builder/api'
import { EditBar } from './EditBar'
import { ClientSectionRenderer } from './ClientSectionRenderer'
import type { EditorContext } from '@/lib/builder/types'

// Lazy-load the heavy edit UI — customers never pay this cost
const EditableSectionList = dynamic(
  () => import('./EditableSectionList').then((m) => m.EditableSectionList),
  { ssr: false },
)
const EditorSidebar = dynamic(
  () => import('./EditorSidebar').then((m) => m.EditorSidebar),
  { ssr: false },
)
// Lazy-load the Premium Design floating drawer (opened via EditBar button)
const PremiumDesignDrawer = dynamic(
  () => import('./PremiumDesignDrawer').then((m) => m.PremiumDesignDrawer),
  { ssr: false },
)

interface Props {
  editorCtx: EditorContext
}

export function EditorShell({ editorCtx }: Props) {
  const {
    editMode,
    sections, setSections,
    setContext,
    setSaveStatus,
    selectedSectionId, selectSection,
  } = useBuilderStore()

  // Initialise store from server-fetched data on first render
  useEffect(() => {
    setSections(editorCtx.sections)
    setContext({
      tenantId:    editorCtx.tenantId,
      pageId:      editorCtx.pageId,
      pageName:    editorCtx.pageName,
      isPublished: editorCtx.isPublished,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorCtx.pageId])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useBuilderStore.getState().undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        useBuilderStore.getState().redo()
      }
      if (e.key === 'Escape') {
        selectSection(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectSection])

  // ── Debounced auto-save ────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevSectionsRef = useRef(sections)

  const scheduleSave = useCallback(
    (changedId: string, content: Record<string, unknown>, isVisible?: boolean) => {
      setSaveStatus('saving')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        const patch: Parameters<typeof saveSection>[1] = { content }
        if (typeof isVisible === 'boolean') patch.is_visible = isVisible
        const saved = await saveSection(changedId, patch)
        setSaveStatus(saved ? 'saved' : 'error')
        // Reset to idle after 3 s
        setTimeout(() => setSaveStatus('idle'), 3000)
      }, 1500)
    },
    [setSaveStatus],
  )

  // Watch sections for content changes and trigger saves
  useEffect(() => {
    const prev = prevSectionsRef.current
    for (const section of sections) {
      const old = prev.find((s) => s.id === section.id)
      if (
        old &&
        (JSON.stringify(old.content) !== JSON.stringify(section.content) ||
          old.is_visible !== section.is_visible)
      ) {
        scheduleSave(section.id, section.content, section.is_visible)
      }
    }
    prevSectionsRef.current = sections
  }, [sections, scheduleSave])

  return (
    <>
      {/* Floating edit bar — always visible for editors */}
      <EditBar />

      {/* AI Premium Design floating drawer — opened via "✦ Premium Design" EditBar button */}
      <PremiumDesignDrawer />

      {/* Main content area */}
      {editMode ? (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          {/* Sections (editable) */}
          <div
            style={{
              flex:            1,
              marginRight:     selectedSectionId ? 380 : 0,
              transition:      'margin-right 0.2s ease',
            }}
          >
            <EditableSectionList />
          </div>

          {/* Sidebar — slides in when a section is selected */}
          {selectedSectionId && (
            <EditorSidebar />
          )}
        </div>
      ) : (
        // Read-only mode — render sections from current store state (optimistic)
        <div>
          {sections
            .filter((s) => s.is_visible)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((section) => (
              <ClientSectionRenderer
                key={section.id}
                section={section}
              />
            ))}
        </div>
      )}
    </>
  )
}
