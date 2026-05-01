'use client'

// lib/builder/store.ts — Zustand store for the in-site visual editor
// Single-page lifetime: created fresh on each navigation. Shared between
// EditorShell (page) and EditBar (layout) via module-level singleton.

import { create } from 'zustand'
import type { BuilderSection, SaveStatus } from './types'

const MAX_HISTORY = 25

interface BuilderState {
  // ── Mode ──────────────────────────────────────────────────────────────────
  editMode:     boolean
  setEditMode:  (v: boolean) => void

  // ── Selection ─────────────────────────────────────────────────────────────
  selectedSectionId: string | null
  selectSection:     (id: string | null) => void

  // ── Sections data ─────────────────────────────────────────────────────────
  sections:        BuilderSection[]
  setSections:     (sections: BuilderSection[]) => void
  /** Optimistically update a section's content; triggers auto-save */
  updateSectionContent: (id: string, content: Record<string, unknown>) => void
  /** Toggle visibility of a section */
  toggleSectionVisibility: (id: string) => void
  addSection:      (section: BuilderSection) => void
  removeSection:   (id: string) => void
  /** Reorder using a new ordered array of sections */
  reorderSections: (sections: BuilderSection[]) => void

  // ── Save status ───────────────────────────────────────────────────────────
  saveStatus:    SaveStatus
  setSaveStatus: (s: SaveStatus) => void

  // ── Context (set once by EditorShell on mount) ────────────────────────────
  tenantId:  string
  pageId:    string
  pageName:  string
  isPublished: boolean
  setContext: (ctx: {
    tenantId: string; pageId: string; pageName: string; isPublished: boolean
  }) => void
  setPublished: (v: boolean) => void

  // ── Undo / redo ───────────────────────────────────────────────────────────
  history:     BuilderSection[][]
  future:      BuilderSection[][]
  pushHistory: () => void
  undo:        () => void
  redo:        () => void
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  // ── Mode ──────────────────────────────────────────────────────────────────
  editMode:    false,
  setEditMode: (v) => set({ editMode: v }),

  // ── Selection ─────────────────────────────────────────────────────────────
  selectedSectionId: null,
  selectSection:     (id) => set({ selectedSectionId: id }),

  // ── Sections ──────────────────────────────────────────────────────────────
  sections:    [],
  setSections: (sections) => set({ sections }),

  updateSectionContent: (id, content) => {
    set({
      sections: get().sections.map((s) =>
        s.id === id ? { ...s, content } : s,
      ),
    })
  },

  toggleSectionVisibility: (id) => {
    set({
      sections: get().sections.map((s) =>
        s.id === id ? { ...s, is_visible: !s.is_visible } : s,
      ),
    })
  },

  addSection: (section) => {
    set({ sections: [...get().sections, section] })
  },

  removeSection: (id) => {
    set({
      sections:          get().sections.filter((s) => s.id !== id),
      selectedSectionId: get().selectedSectionId === id ? null : get().selectedSectionId,
    })
  },

  reorderSections: (sections) => {
    set({ sections })
  },

  // ── Save status ───────────────────────────────────────────────────────────
  saveStatus:    'idle',
  setSaveStatus: (s) => set({ saveStatus: s }),

  // ── Context ───────────────────────────────────────────────────────────────
  tenantId:  '',
  pageId:    '',
  pageName:  '',
  isPublished: false,
  setContext: (ctx) => set(ctx),
  setPublished: (v) => set({ isPublished: v }),

  // ── Undo / redo ───────────────────────────────────────────────────────────
  history: [],
  future:  [],

  pushHistory: () => {
    const { sections, history } = get()
    set({
      history: [...history.slice(-MAX_HISTORY), [...sections]],
      future:  [],
    })
  },

  undo: () => {
    const { history, sections, future } = get()
    if (history.length === 0) return
    const prev = history[history.length - 1]
    set({
      sections: prev,
      history:  history.slice(0, -1),
      future:   [...future.slice(-MAX_HISTORY), [...sections]],
    })
  },

  redo: () => {
    const { future, sections, history } = get()
    if (future.length === 0) return
    const next = future[future.length - 1]
    set({
      sections: next,
      history:  [...history.slice(-MAX_HISTORY), [...sections]],
      future:   future.slice(0, -1),
    })
  },
}))
