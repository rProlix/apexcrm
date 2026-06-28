// components/website/canva/CanvaImportDiagnostics.tsx
// Read-only "Canva Import Diagnostics" panel for the builder/admin.

interface DiagSettings {
  website_type: string | null
  pov_enabled: boolean
  pov_event_id: string | null
  canva_import_enabled: boolean
  canva_import_id: string | null
  canva_import_mode: string | null
  canva_source_url: string | null
  canva_animation_preservation: string | null
  is_published: boolean
  subdomain: string | null
  custom_domain: string | null
}

interface DiagImport {
  id: string
  source_type: string
  import_mode: string
  status: string
  animation_preservation: string
  source_domain?: string | null
  validation_mode?: string | null
  is_custom_domain?: boolean
  warnings: string[]
  created_at: string
}

interface DiagRuns {
  latestRunId: string | null
  latestRunStatus: string | null
  hasPreImportSnapshot: boolean
  hasBeforePublishedSnapshot: boolean
  undoAvailable: boolean
}

export function CanvaImportDiagnostics({ settings, imports, runs }: { settings: DiagSettings; imports: DiagImport[]; runs?: DiagRuns }) {
  const active = imports.find((i) => i.id === settings.canva_import_id)
  const publicUrl = settings.custom_domain
    ? `https://${settings.custom_domain}`
    : settings.subdomain ? `https://${settings.subdomain}` : null

  const povCta = settings.canva_import_enabled && settings.pov_enabled
  const rows: Array<[string, string]> = [
    ['Website type', settings.website_type ?? '—'],
    ['POV enabled', settings.pov_enabled ? 'Yes' : 'No'],
    ['Linked POV event', settings.pov_event_id ?? '—'],
    ['Canva import enabled', settings.canva_import_enabled ? 'Yes' : 'No'],
    ['Import id', settings.canva_import_id ?? '—'],
    ['Import mode', settings.canva_import_mode ?? '—'],
    ['Source type', active?.source_type ?? '—'],
    ['Source URL', settings.canva_source_url ?? '—'],
    ['Source domain', active?.source_domain ?? '—'],
    ['Validation mode', active?.validation_mode ?? '—'],
    ['Custom domain', active?.is_custom_domain ? 'Yes' : 'No'],
    ['Iframe URL', settings.canva_import_mode === 'preserve' ? (settings.canva_source_url ?? '—') : '—'],
    ['Import status', active?.status ?? '—'],
    ['Animation preservation', settings.canva_animation_preservation ?? active?.animation_preservation ?? '—'],
    ['Event Camera CTA', povCta ? 'Enabled' : 'Off'],
    ['Gallery CTA', povCta ? 'Enabled' : 'Off'],
    ['Public route', publicUrl ?? 'Not configured'],
    ['Publish required', settings.canva_import_enabled && !settings.is_published ? 'Yes — publish to go live' : 'No'],
    ['Latest import run', runs?.latestRunId ?? '—'],
    ['Import run status', runs?.latestRunStatus ?? '—'],
    ['Has pre-import snapshot', runs?.hasPreImportSnapshot ? 'Yes' : 'No'],
    ['Has before-published snapshot', runs?.hasBeforePublishedSnapshot ? 'Yes' : 'No'],
    ['Undo available', runs?.undoAvailable ? 'Yes' : 'No'],
  ]

  const staticNotes: string[] = []
  if (active?.is_custom_domain) staticNotes.push('Custom domain accepted. Embedding may fail if the domain blocks iframes.')
  if (settings.canva_import_enabled) {
    staticNotes.push('Use canva.site or Canva embed code for best compatibility.')
    if (settings.pov_enabled) staticNotes.push('POV Event Camera remains native NexoraNow even when Canva is embedded.')
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-graphite-800/40 p-6 space-y-4">
      <h2 className="text-base font-semibold text-white">Canva Import Diagnostics</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-white/5 py-1.5">
            <dt className="text-white/40">{k}</dt>
            <dd className="text-white/80 text-right break-all">{v}</dd>
          </div>
        ))}
      </dl>

      {!!active?.warnings?.length && (
        <div>
          <p className="text-xs font-medium text-amber-300 mb-1">Warnings</p>
          <ul className="list-disc list-inside text-xs text-amber-300/80 space-y-0.5">
            {active.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {!!staticNotes.length && (
        <ul className="list-disc list-inside text-xs text-white/40 space-y-0.5">
          {staticNotes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

      {imports.length > 1 && (
        <div className="text-2xs text-white/30">{imports.length} total import attempts recorded.</div>
      )}
    </div>
  )
}
