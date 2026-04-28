'use client'
// components/SpinViewer360/SpinViewer360Lazy.tsx
// Dynamic-import wrapper that prevents Three.js / canvas code from running
// during SSR.  Import THIS component in server components and pages.

import dynamic from 'next/dynamic'
import type { SpinViewer360Props } from './SpinViewer360'

const SpinViewer360 = dynamic<SpinViewer360Props>(
  () => import('./SpinViewer360').then(m => m.SpinViewer360),
  {
    ssr:     false,
    loading: () => (
      <div className="w-full aspect-square rounded-2xl bg-zinc-950 flex flex-col items-center justify-center gap-3 animate-pulse">
        <div className="h-16 w-16 rounded-full border-4 border-white/10" />
        <span className="text-white/20 text-xs tracking-widest uppercase">Loading viewer</span>
      </div>
    ),
  }
)

export default SpinViewer360
