'use client'

// components/builder/EditorShellClient.tsx
//
// Thin 'use client' boundary that lazy-loads EditorShell with ssr:false.
//
// WHY this file exists:
//   next/dynamic with ssr:false is forbidden inside Server Components (Next 15).
//   The site page.tsx is an async Server Component, so it cannot call dynamic()
//   with ssr:false directly. This wrapper lives entirely in the client boundary,
//   so the dynamic import is legal here.
//
// Customers NEVER download this bundle — the server only renders this component
// for owner/admin visitors, so the import() call is never triggered for public traffic.

import dynamic from 'next/dynamic'
import type { EditorContext } from '@/lib/builder/types'

const EditorShell = dynamic(
  () => import('./EditorShell').then((m) => m.EditorShell),
  {
    ssr: false,
    loading: () => (
      <div style={{
        minHeight: '100vh',
        display:   'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#09090b',
        color: '#52525b',
        fontSize: '0.875rem',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        Loading editor…
      </div>
    ),
  },
)

interface Props {
  editorCtx: EditorContext
}

export default function EditorShellClient({ editorCtx }: Props) {
  return <EditorShell editorCtx={editorCtx} />
}
