'use client'
// components/website/import-engine/DesignImportDiagnostics.tsx
// Import Diagnostics panel for the Universal AI Design Import Engine.

import { cn } from '@/lib/utils'

export interface DesignImportDiagnosticsProps {
  diagnostics: Record<string, unknown> | null
  className?: string
}

function num(v: unknown): number | string {
  return typeof v === 'number' ? v : '—'
}

function pct(v: unknown): string {
  return typeof v === 'number' ? `${v}%` : '—'
}

export function DesignImportDiagnostics({ diagnostics, className }: DesignImportDiagnosticsProps) {
  if (!diagnostics) return null

  const confidence = (diagnostics.confidence as Record<string, number> | undefined) ?? {}
  const warnings = Array.isArray(diagnostics.warnings) ? (diagnostics.warnings as string[]) : []
  const errors = Array.isArray(diagnostics.errors) ? (diagnostics.errors as string[]) : []
  const stages = Array.isArray(diagnostics.stagesCompleted) ? (diagnostics.stagesCompleted as string[]) : []

  const rows: Array<[string, string | number]> = [
    ['Import type', String(diagnostics.importType ?? '—')],
    ['Pages', num(diagnostics.pages)],
    ['Sections created', num(diagnostics.sectionsCreated)],
    ['Images found', num(diagnostics.imagesFound)],
    ['Graphics found', num(diagnostics.graphicsFound)],
    ['Illustrations', num(diagnostics.illustrationsFound)],
    ['Fonts detected', num(diagnostics.fontsDetected)],
    ['Buttons found', num(diagnostics.buttonsFound)],
    ['Links mapped', num(diagnostics.linksFound)],
    ['Backgrounds', num(diagnostics.backgroundsFound)],
    ['Animations created', num(diagnostics.animationsCreated)],
    ['Responsive layout', diagnostics.responsiveLayout ? 'Yes' : 'No'],
    ['Attempts', num(diagnostics.attemptCount)],
    ['Time taken', typeof diagnostics.timeTakenMs === 'number' ? `${Math.round(diagnostics.timeTakenMs / 1000)}s` : '—'],
  ]

  return (
    <div className={cn('rounded-xl border border-white/10 bg-black/20 p-4 text-sm', className)}>
      <h4 className="mb-3 font-semibold text-white">Import Diagnostics</h4>

      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-white/70 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 sm:block">
            <span className="text-white/45">{label}</span>
            <span className="font-medium text-white/90">{value}</span>
          </div>
        ))}
      </div>

      <div className="mb-4 rounded-lg bg-white/5 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Confidence</p>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          {[
            ['Visual', confidence.visualMatch],
            ['Layout', confidence.layoutMatch],
            ['Typography', confidence.typographyMatch],
            ['Color', confidence.colorMatch],
            ['Images', confidence.imagesMatch],
            ['Buttons', confidence.buttonsMatch],
            ['Animations', confidence.animationsMatch],
            ['Responsive', confidence.responsiveMatch],
            ['Overall', confidence.overall],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between rounded-md bg-black/20 px-2 py-1">
              <span className="text-white/50">{label}</span>
              <span className={cn('font-semibold', typeof value === 'number' && value >= 90 ? 'text-emerald-400' : 'text-amber-300')}>
                {pct(value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {stages.length > 0 && (
        <p className="mb-3 text-xs text-white/45">
          Pipeline: {stages.join(' → ')}
        </p>
      )}

      {warnings.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium text-amber-300">Warnings</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-white/60">
            {warnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {errors.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-red-400">Errors</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-white/60">
            {errors.slice(0, 4).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
