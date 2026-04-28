'use client'
// components/spin-packages/SpinStatusBadge.tsx

import type { SpinPackageStatus } from '@/types/spin-packages'

const STATUS_CONFIG: Record<SpinPackageStatus, { label: string; className: string }> = {
  draft:      { label: 'Draft',      className: 'bg-zinc-700 text-zinc-300' },
  generating: { label: 'Generating', className: 'bg-amber-500/20 text-amber-400 animate-pulse' },
  ready:      { label: 'Ready',      className: 'bg-emerald-500/20 text-emerald-400' },
  failed:     { label: 'Failed',     className: 'bg-red-500/20 text-red-400' },
}

export default function SpinStatusBadge({ status }: { status: SpinPackageStatus }) {
  const { label, className } = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {status === 'generating' && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
      )}
      {label}
    </span>
  )
}
