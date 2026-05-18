'use client'

// components/builder/EditBar.tsx
// Floating fixed top bar shown only to owners/admins while browsing the live site.
// Provides: edit mode toggle, publish/unpublish, undo/redo, save status, version
// history, and checkpoint controls.

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useBuilderStore } from '@/lib/builder/store'
import { publishSite } from '@/lib/builder/api'
import { createVersionCheckpoint, triggerAutosave } from '@/lib/builder/versionsApi'
import { buildClientPageSections } from '@/lib/builder/createSnapshotFromBuilderState'

const VersionHistoryPanel = dynamic(
  () => import('./VersionHistoryPanel').then((m) => m.VersionHistoryPanel),
  { ssr: false },
)

// ── Premium Design wand icon (inline SVG so no import needed) ─────────────
function WandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/>
      <path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/>
      <path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>
    </svg>
  )
}

const BAR_HEIGHT = 48

export function EditBar() {
  const {
    editMode, setEditMode,
    saveStatus,
    tenantId, pageName, pageSlug, pageType, isPublished, setPublished,
    undo, redo, history, future,
    showPremiumDrawer, setPremiumDrawer,
    showRestyleDrawer, setRestyleDrawer,
    sections, pageId,
    flushPendingSaves,
  } = useBuilderStore()

  const [publishing,        setPublishing]        = useState(false)
  const [versionOpen,       setVersionOpen]        = useState(false)
  const [checkpointOk,      setCheckpointOk]      = useState(false)
  const [checkpointLoading, setCheckpointLoading] = useState(false)

  // Push padding onto document body so the site header isn't hidden behind the bar
  useEffect(() => {
    const prev = document.body.style.paddingTop
    document.body.style.paddingTop = `${BAR_HEIGHT}px`
    document.documentElement.style.setProperty('--editor-bar-height', `${BAR_HEIGHT}px`)
    return () => {
      document.body.style.paddingTop = prev
      document.documentElement.style.removeProperty('--editor-bar-height')
    }
  }, [])

  // Auto-save: any time sections change while saveStatus is 'saving' → we've
  // already scheduled the save; just wait for it.
  // The actual debounced save logic lives in EditorShell.

  const handlePublish = useCallback(async () => {
    if (publishing) return
    setPublishing(true)
    try {
      // 1. Flush any pending debounced saves so the latest editor state is in DB
      //    before the publish snapshot is built from live tables.
      await flushPendingSaves().catch(() => null)

      // 2. Build client sections to send alongside the request so the server
      //    can use them as an additional override even if flush was partial.
      const clientPageSections = pageId ? buildClientPageSections({
        pageId,
        pageSlug:  pageSlug  || '/',
        pageTitle: pageName  || 'Home',
        pageType:  pageType  || 'page',
        sections,
      }) : undefined

      const result = await publishSite(tenantId, !isPublished, { clientPageSections })

      if (result.ok) {
        setPublished(!isPublished)
        if (result.warnings?.length) {
          console.warn('[EditBar] Publish warnings:', result.warnings)
        }
      } else {
        const msg = result.error ?? 'Publish failed'
        const detail = result.details ? ` (${result.details})` : ''
        console.error(`[EditBar] Publish error: ${msg}${detail}`)
        // Surface error to user via alert (simple, visible)
        window.alert(`Publish failed: ${msg}${detail}`)
      }
    } finally {
      setPublishing(false)
    }
  }, [publishing, tenantId, isPublished, setPublished, flushPendingSaves, pageId, pageSlug, pageName, pageType, sections])

  const handleCheckpoint = useCallback(async () => {
    if (checkpointLoading) return
    setCheckpointLoading(true)
    try {
      // 1. Flush any pending auto-save first (cancel debounce, save immediately)
      await flushPendingSaves()

      // 2. Build the client-side page sections so the checkpoint captures
      //    the actual current state — not potentially stale DB data
      const clientPageSections = pageId ? buildClientPageSections({
        pageId,
        pageSlug:  pageSlug  || '/',
        pageTitle: pageName  || 'Home',
        pageType:  pageType  || 'page',
        sections,
      }) : undefined

      const v = await createVersionCheckpoint('Manual checkpoint', 'manual', clientPageSections)
      if (v) {
        setCheckpointOk(true)
        setTimeout(() => setCheckpointOk(false), 2500)
      }
    } finally {
      setCheckpointLoading(false)
    }
  }, [checkpointLoading, flushPendingSaves, pageId, pageSlug, pageName, pageType, sections])

  return (
    <>
    <div style={{
      position:       'fixed',
      top:            0,
      left:           0,
      right:          0,
      height:         BAR_HEIGHT,
      zIndex:         99999,
      background:     '#1a1a1f',
      borderBottom:   '1px solid #2e2e38',
      display:        'flex',
      alignItems:     'center',
      padding:        '0 1rem',
      gap:            '0.5rem',
      fontFamily:     'Inter, system-ui, sans-serif',
      fontSize:       '0.8125rem',
    }}>
      {/* Brand / page context */}
      <a
        href="/website"
        title="Open full builder"
        style={{
          display:        'flex',
          alignItems:     'center',
          gap:            '0.375rem',
          color:          '#c9a84c',
          fontWeight:     700,
          textDecoration: 'none',
          flexShrink:     0,
          fontSize:       '0.875rem',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22" fill="none" stroke="currentColor" strokeWidth="2"/>
        </svg>
        <span style={{ display: 'none', ['@media(min-width:480px)' as never]: { display: 'block' } }}>
          {pageName || 'Builder'}
        </span>
      </a>

      <div style={{ flex: 1 }} />

      {/* Save status */}
      {editMode && saveStatus !== 'idle' && (
        <span style={{
          fontSize:  '0.75rem',
          color:     saveStatus === 'saved'  ? '#22c55e'
                   : saveStatus === 'saving' ? '#f59e0b'
                   : saveStatus === 'error'  ? '#ef4444'
                   : '#6b7280',
          minWidth:  64,
          textAlign: 'right',
          flexShrink: 0,
        }}>
          {saveStatus === 'saving' ? 'Saving…'
          : saveStatus === 'saved'  ? 'Saved ✓'
          : saveStatus === 'error'  ? 'Save failed'
          : ''}
        </span>
      )}

      {/* Undo / Redo — only in edit mode */}
      {editMode && (
        <>
          <IconButton
            onClick={undo}
            disabled={history.length === 0}
            title="Undo (Ctrl+Z)"
          >
            ↩
          </IconButton>
          <IconButton
            onClick={redo}
            disabled={future.length === 0}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↪
          </IconButton>
        </>
      )}

      {/* Version history + checkpoint — only in edit mode */}
      {editMode && (
        <>
          <IconButton
            onClick={() => setVersionOpen(true)}
            title="Version History"
          >
            🕐
          </IconButton>
          <IconButton
            onClick={handleCheckpoint}
            disabled={checkpointLoading}
            title="Save Version Checkpoint"
          >
            {checkpointLoading ? '⋯' : checkpointOk ? '✓' : '📌'}
          </IconButton>
        </>
      )}

      {/* AI Restyle button */}
      <button
        onClick={() => { setRestyleDrawer(!showRestyleDrawer); if (showPremiumDrawer) setPremiumDrawer(false) }}
        title="AI Restyle Website — redesign visual style while keeping your content"
        style={{
          padding:      '0.375rem 0.75rem',
          borderRadius: '0.5rem',
          border:       `1px solid ${showRestyleDrawer ? '#6366f1' : '#6366f155'}`,
          background:   showRestyleDrawer ? 'rgba(99,102,241,0.15)' : 'transparent',
          color:        showRestyleDrawer ? '#a5b4fc' : '#818cf899',
          fontWeight:   700,
          cursor:       'pointer',
          fontSize:     '0.8125rem',
          display:      'flex',
          alignItems:   'center',
          gap:          '0.375rem',
          whiteSpace:   'nowrap',
          transition:   'all 0.15s',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
        </svg>
        AI Restyle
      </button>

      {/* ✦ Premium Design button — always visible */}
      <button
        onClick={() => { setPremiumDrawer(!showPremiumDrawer); if (showRestyleDrawer) setRestyleDrawer(false) }}
        title="AI Premium Design &amp; Animations"
        style={{
          padding:      '0.375rem 0.75rem',
          borderRadius: '0.5rem',
          border:       `1px solid ${showPremiumDrawer ? '#c9a84c' : '#c9a84c55'}`,
          background:   showPremiumDrawer ? '#c9a84c22' : 'transparent',
          color:        showPremiumDrawer ? '#c9a84c' : '#c9a84c99',
          fontWeight:   700,
          cursor:       'pointer',
          fontSize:     '0.8125rem',
          display:      'flex',
          alignItems:   'center',
          gap:          '0.375rem',
          whiteSpace:   'nowrap',
          transition:   'all 0.15s',
        }}
      >
        <WandIcon />
        ✦ Premium Design
      </button>

      {/* Publish toggle */}
      <button
        onClick={handlePublish}
        disabled={publishing}
        style={{
          padding:      '0.375rem 0.875rem',
          borderRadius: '0.5rem',
          border:       `1px solid ${isPublished ? '#22c55e44' : '#ffffff22'}`,
          background:   isPublished ? '#16a34a22' : 'transparent',
          color:        isPublished ? '#22c55e' : '#9ca3af',
          fontWeight:   600,
          cursor:       publishing ? 'not-allowed' : 'pointer',
          fontSize:     '0.8125rem',
          opacity:      publishing ? 0.6 : 1,
          transition:   'all 0.15s',
          whiteSpace:   'nowrap',
        }}
      >
        {publishing ? '…' : isPublished ? '● Live' : 'Publish'}
      </button>

      {/* Edit mode toggle — primary action */}
      <button
        onClick={() => setEditMode(!editMode)}
        style={{
          padding:      '0.375rem 1rem',
          borderRadius: '0.5rem',
          border:       'none',
          background:   editMode ? '#c9a84c' : '#3f3f46',
          color:        editMode ? '#000' : '#fff',
          fontWeight:   700,
          cursor:       'pointer',
          fontSize:     '0.8125rem',
          transition:   'all 0.15s',
          display:      'flex',
          alignItems:   'center',
          gap:          '0.375rem',
          whiteSpace:   'nowrap',
        }}
      >
        {editMode ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Editing
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit Website
          </>
        )}
      </button>
    </div>

    <VersionHistoryPanel
      open={versionOpen}
      onClose={() => setVersionOpen(false)}
    />
    </>
  )
}

function IconButton({
  children, onClick, disabled, title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width:        28,
        height:       28,
        borderRadius: '0.375rem',
        border:       '1px solid #3f3f46',
        background:   'transparent',
        color:        disabled ? '#3f3f46' : '#a1a1aa',
        cursor:       disabled ? 'not-allowed' : 'pointer',
        fontSize:     '0.9375rem',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        padding:      0,
      }}
    >
      {children}
    </button>
  )
}
