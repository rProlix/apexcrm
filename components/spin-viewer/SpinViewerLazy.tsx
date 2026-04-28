'use client'
// components/spin-viewer/SpinViewerLazy.tsx
// Dynamic import wrapper — ensures Three.js is only loaded client-side.

import dynamic from 'next/dynamic'

const SpinViewer = dynamic(() => import('./SpinViewer'), {
  ssr:     false,
  loading: () => (
    <div className="w-full aspect-square rounded-xl bg-[#111] flex items-center justify-center">
      <span className="text-white/30 text-xs tracking-widest uppercase">Loading viewer…</span>
    </div>
  ),
})

export default SpinViewer
