'use client'

// components/builder/EditorShellClient.tsx
//
// Client-only boundary that wraps the dynamic import of EditorShell.
//
// WHY this file exists:
//   next/dynamic({ ssr: false }) is NOT allowed inside Server Components.
//   app/sites/[tenant]/[[...slug]]/page.tsx is a Server Component, so it
//   cannot hold that call. This file provides the client boundary — the
//   server page imports this lightweight wrapper, and only browsers
//   (never the SSR runtime) download EditorShell + the builder bundle.
//
// Props mirror EditorShell exactly — all values must be serializable
// (no Supabase clients, Request/Response objects, or functions).

import dynamic from 'next/dynamic'
import type { EditorContext } from '@/lib/builder/types'

const EditorShellDynamic = dynamic(
  () => import('@/components/builder/EditorShell').then((m) => m.EditorShell),
  {
    ssr: false,
    loading: () => (
      <div style={{
        minHeight:      '100vh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     'var(--color-bg, #0f0f13)',
      }}>
        <div style={{
          padding:      '1rem 2rem',
          borderRadius: '1rem',
          border:       '1px solid rgba(255,255,255,0.08)',
          background:   'rgba(0,0,0,0.4)',
          color:        'rgba(255,255,255,0.6)',
          fontSize:     '0.875rem',
        }}>
          Loading website editor…
        </div>
      </div>
    ),
  },
)

interface Props {
  editorCtx: EditorContext
}

export function EditorShellClient({ editorCtx }: Props) {
  return <EditorShellDynamic editorCtx={editorCtx} />
}
