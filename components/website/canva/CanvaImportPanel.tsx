'use client'
// components/website/canva/CanvaImportPanel.tsx
// "Import Canva Event Website" — used in the Invitation/Event builder setup and
// on the standalone Canva settings page. Preserve Mode embeds the live Canva
// design; Converted Mode rebuilds editable NexoraNow sections.

import { useState } from 'react'
import { Sparkles, Link2, Code2, Upload, Camera, Images, Check, Trash2, Eye, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { CANVA_APPROXIMATION_NOTICE } from '@/lib/website/canva/types'

type SourceMode = 'canva_url' | 'embed_code' | 'html_upload' | 'asset_upload'
type ImportMode = 'preserve' | 'converted'

interface Props {
  tenantId:    string
  povEventId?: string | null
  websiteId?:  string
  onApplied?:  () => void
}

interface PreviewData {
  mode: string
  valid: boolean
  embedHtml?: string | null
  title?: string | null
  colors?: string[]
  images?: string[]
  sectionCount?: number
  animationPreservation?: string
  notice?: string
  warnings?: string[]
}

export function CanvaImportPanel({ tenantId, povEventId, websiteId, onApplied }: Props) {
  const [sourceMode, setSourceMode] = useState<SourceMode>('canva_url')
  const [importMode, setImportMode] = useState<ImportMode>('preserve')
  const [canvaUrl, setCanvaUrl]     = useState('')
  const [embedCode, setEmbedCode]   = useState('')
  const [file, setFile]             = useState<File | null>(null)

  const [opts, setOpts] = useState({
    useAsHomepage: true,
    addEventCameraButton: true,
    addGalleryButton: true,
    addRsvpButton: false,
    keepNativePovPages: true,
  })

  const [busy, setBusy]       = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [result, setResult]   = useState<{ warnings: string[]; sections: number; preservation: string } | null>(null)
  const [error, setError]     = useState<string | null>(null)

  function buildPayload(): FormData | string {
    const base: Record<string, unknown> = {
      tenant_id: tenantId, websiteId: websiteId ?? tenantId, povEventId: povEventId ?? null,
      sourceType: sourceMode, importMode, canvaUrl: canvaUrl || null, embedCode: embedCode || null,
      settings: opts,
    }
    if (file) {
      const fd = new FormData()
      Object.entries(base).forEach(([k, v]) => fd.append(k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')))
      fd.append('file', file)
      return fd
    }
    return JSON.stringify(base)
  }

  async function send(path: string, onOk: (json: Record<string, unknown>) => void) {
    setBusy(true); setError(null)
    try {
      const payload = buildPayload()
      const res = await fetch(path, {
        method: 'POST',
        ...(typeof payload === 'string' ? { headers: { 'Content-Type': 'application/json' }, body: payload } : { body: payload }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Request failed')
      onOk(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const doPreview = () => send('/api/website/canva/preview', (j) => { setPreview(j as unknown as PreviewData); setResult(null) })
  const doImport  = () => send('/api/website/canva/import', (j) => {
    setResult({
      warnings: (j.warnings as string[]) ?? [],
      sections: (j.sectionsWritten as number) ?? 0,
      preservation: (j.animationPreservation as string) ?? 'unknown',
    })
    onApplied?.()
  })

  async function doRemove() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/website/settings?tenant_id=${encodeURIComponent(tenantId)}`)
      const j = await res.json()
      const importId = j?.settings?.canva_import_id
      if (!importId) { setError('No active Canva import to remove.'); return }
      const del = await fetch(`/api/website/canva/imports/${importId}?tenant_id=${encodeURIComponent(tenantId)}`, { method: 'DELETE' })
      if (!del.ok) throw new Error('Could not remove import')
      setResult(null); setPreview(null)
      onApplied?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-graphite-800/40 p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold-400" />
          Import Canva Event Website
        </h2>
        <p className="text-xs text-white/40 mt-1 leading-relaxed">
          Preserve Canva Mode keeps Canva animations closest to the original by embedding the published
          design. Converted Editable Mode rebuilds the design into NexoraNow sections so it can be edited,
          but some animations may be approximated.
        </p>
      </div>

      {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</div>}

      {/* Import mode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ModeCard active={importMode === 'preserve'} onClick={() => setImportMode('preserve')}
          title="Preserve Canva Mode" desc="Recommended for exact animations. Embeds your published Canva design." />
        <ModeCard active={importMode === 'converted'} onClick={() => setImportMode('converted')}
          title="Converted Editable Mode" desc="Recommended for editing inside NexoraNow. Rebuilds content into sections." />
      </div>

      {importMode === 'converted' && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-300">
          {CANVA_APPROXIMATION_NOTICE}
        </div>
      )}

      {/* Source */}
      <div className="flex flex-wrap gap-2">
        <SrcTab icon={Link2}  label="Canva URL"     on={sourceMode === 'canva_url'}  onClick={() => setSourceMode('canva_url')} />
        <SrcTab icon={Code2}  label="Embed code"    on={sourceMode === 'embed_code'} onClick={() => setSourceMode('embed_code')} />
        <SrcTab icon={Upload} label="Upload HTML"   on={sourceMode === 'html_upload'} onClick={() => setSourceMode('html_upload')} />
        <SrcTab icon={Images} label="Upload assets" on={sourceMode === 'asset_upload'} onClick={() => setSourceMode('asset_upload')} />
      </div>

      {sourceMode === 'canva_url' && (
        <input className={inputCls} value={canvaUrl} onChange={(e) => setCanvaUrl(e.target.value)}
          placeholder="https://www.canva.com/design/XXXX/view" />
      )}
      {sourceMode === 'embed_code' && (
        <textarea className={cn(inputCls, 'h-24 py-2')} value={embedCode} onChange={(e) => setEmbedCode(e.target.value)}
          placeholder='<iframe src="https://www.canva.com/design/.../view?embed" ...></iframe>' />
      )}
      {(sourceMode === 'html_upload' || sourceMode === 'asset_upload') && (
        <input type="file" accept={sourceMode === 'html_upload' ? '.html,.htm,text/html' : 'image/*,.zip'}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white/80" />
      )}

      {/* Toggles */}
      <div className="flex flex-wrap gap-2">
        <Toggle icon={Check}  label="Use Canva as homepage"   on={opts.useAsHomepage}        onClick={() => setOpts((o) => ({ ...o, useAsHomepage: !o.useAsHomepage }))} />
        <Toggle icon={Camera} label="Add Event Camera button" on={opts.addEventCameraButton} onClick={() => setOpts((o) => ({ ...o, addEventCameraButton: !o.addEventCameraButton }))} />
        <Toggle icon={Images} label="Add Gallery button"      on={opts.addGalleryButton}     onClick={() => setOpts((o) => ({ ...o, addGalleryButton: !o.addGalleryButton }))} />
        <Toggle icon={Check}  label="Add RSVP / Details"      on={opts.addRsvpButton}        onClick={() => setOpts((o) => ({ ...o, addRsvpButton: !o.addRsvpButton }))} />
        <Toggle icon={Check}  label="Keep native POV pages"   on={opts.keepNativePovPages}   onClick={() => setOpts((o) => ({ ...o, keepNativePovPages: !o.keepNativePovPages }))} />
      </div>

      {/* Preview output */}
      {preview && (
        <div className="rounded-xl border border-surface-border bg-graphite-900/60 p-4 text-xs text-white/60 space-y-2">
          <p className="text-white/80 font-medium">Preview ({preview.mode})</p>
          {preview.mode === 'preserve' && (
            <p>{preview.valid ? 'Valid Canva embed — animations preserved exactly.' : 'Invalid Canva URL/embed.'}</p>
          )}
          {preview.mode === 'converted' && (
            <>
              {preview.title && <p>Title: <span className="text-white/80">{preview.title}</span></p>}
              <p>Sections: {preview.sectionCount} · Images: {preview.images?.length ?? 0} · Animation: {preview.animationPreservation}</p>
              {!!preview.colors?.length && (
                <div className="flex gap-1">{preview.colors.map((c) => <span key={c} className="h-4 w-4 rounded" style={{ background: c }} />)}</div>
              )}
            </>
          )}
          {!!preview.warnings?.length && (
            <ul className="list-disc list-inside text-amber-300/80">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-200 space-y-2">
          <p className="font-medium">Imported and applied to your event website.</p>
          <p>{result.sections} section(s) written · animation: {result.preservation}</p>
          {!!result.warnings.length && (
            <ul className="list-disc list-inside text-amber-300/80">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={doPreview} loading={busy}>
          <Eye className="h-4 w-4" /> Preview Imported Website
        </Button>
        <Button variant="primary" onClick={doImport} loading={busy}>
          Import &amp; Apply to Event Website <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" onClick={doRemove} loading={busy}>
          <Trash2 className="h-4 w-4" /> Remove Canva Import
        </Button>
      </div>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-graphite-900 border border-surface-border text-sm text-white placeholder-white/30 focus:border-gold-500/50 focus:outline-none transition-colors'

function ModeCard({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('text-left rounded-xl border p-4 transition-all',
        active ? 'border-gold-500/50 bg-gold-500/10' : 'border-surface-border bg-graphite-900/40 hover:border-white/20')}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-white">{title}</p>
        {active && <Check className="h-4 w-4 text-gold-400" />}
      </div>
      <p className="text-xs text-white/40 mt-1 leading-relaxed">{desc}</p>
    </button>
  )
}

function SrcTab({ icon: Icon, label, on, onClick }: { icon: React.ElementType; label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-medium border transition-colors',
        on ? 'bg-gold-500/10 border-gold-500/30 text-gold-300' : 'bg-white/5 border-white/10 text-white/40')}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

function Toggle({ icon: Icon, label, on, onClick }: { icon: React.ElementType; label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-medium border transition-colors',
        on ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-white/40')}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
