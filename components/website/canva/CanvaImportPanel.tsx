'use client'
// components/website/canva/CanvaImportPanel.tsx
// "Import Canva Event Website" — used in the Invitation/Event builder setup and
// on the standalone Canva settings page. Preserve Mode embeds the live Canva
// design; Converted Mode rebuilds editable NexoraNow sections.

import { useState } from 'react'
import { Sparkles, Link2, Code2, Upload, Camera, Images, Check, Trash2, Eye, ArrowRight, RotateCcw, Rocket, Save, Copy, ExternalLink, ChevronDown, FileText, Wand2, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { CANVA_APPROXIMATION_NOTICE } from '@/lib/website/canva/types'
import { parseCanvaEmbedSource, type CanvaEmbedSource } from '@/lib/website/canva/canva-url'
import { CanvaPreserveEmbed, type CanvaEmbedStatus } from '@/components/website/canva/CanvaPreserveEmbed'

type SourceMode = 'canva_url' | 'embed_code' | 'html_upload' | 'asset_upload' | 'pdf_upload'
type ImportMode = 'preserve' | 'converted'
type ConversionStyle = 'faithful' | 'clean_premium' | 'mobile_first'
type AnimationLevel = 'subtle' | 'balanced' | 'premium_cinematic'

interface Props {
  tenantId:    string
  povEventId?: string | null
  websiteId?:  string
  registryWebsiteId?: string | null
  onApplied?:  () => void
  /**
   * When true the panel creates/saves a SEPARATE config-backed Invitation/Event
   * website (source='config') instead of writing to the tenant builder draft.
   * This is the "New Website/App → Import from Canva" flow.
   */
  eventWebsiteMode?: boolean
  initialWebsiteId?: string | null
  onSaved?: (info: { websiteId: string; publicSlug: string; status: string }) => void
}

interface EventDraftState {
  websiteId: string
  publicSlug: string
  status: string
  draftPreviewUrl: string
  liveUrl: string
  importId?: string | null
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

export function CanvaImportPanel({ tenantId, povEventId, websiteId, registryWebsiteId, onApplied, eventWebsiteMode = false, initialWebsiteId = null, onSaved }: Props) {
  const [sourceMode, setSourceMode] = useState<SourceMode>('canva_url')
  const [importMode, setImportMode] = useState<ImportMode>('preserve')
  const [canvaUrl, setCanvaUrl]     = useState('')
  const [embedCode, setEmbedCode]   = useState('')
  const [file, setFile]             = useState<File | null>(null)
  const [siteName, setSiteName]     = useState('')

  const [isCustomDomain, setIsCustomDomain] = useState(false)

  // Event-website (config-backed) lifecycle state.
  const [eventDraft, setEventDraft] = useState<EventDraftState | null>(
    initialWebsiteId ? { websiteId: initialWebsiteId, publicSlug: '', status: 'draft', draftPreviewUrl: '', liveUrl: '' } : null,
  )
  const [savedMsg, setSavedMsg]   = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)
  const [showDiag, setShowDiag]   = useState(false)

  // Test Embed (live in-panel preview).
  const [testSource, setTestSource] = useState<CanvaEmbedSource | null>(null)
  const [embedLoadState, setEmbedLoadState] = useState<CanvaEmbedStatus | null>(null)

  // Canva PDF import.
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [conversionStyle, setConversionStyle] = useState<ConversionStyle>('faithful')
  const [animationLevel, setAnimationLevel] = useState<AnimationLevel>('balanced')
  const [pdfStep, setPdfStep] = useState<string | null>(null)
  const [pdfDiag, setPdfDiag] = useState<Record<string, unknown> | null>(null)

  const [opts, setOpts] = useState({
    useAsHomepage: true,
    addEventCameraButton: true,
    addGalleryButton: true,
    addRsvpButton: false,
    keepNativePovPages: true,
  })

  const [busy, setBusy]       = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [result, setResult]   = useState<{ warnings: string[]; sections: number; preservation: string; importId?: string; runId?: string | null } | null>(null)
  const [rollbackMsg, setRollbackMsg] = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  function buildPayload(): FormData | string {
    const base: Record<string, unknown> = {
      tenant_id: tenantId, websiteId: websiteId ?? tenantId, povEventId: povEventId ?? null,
      sourceType: sourceMode, importMode, canvaUrl: canvaUrl || null, embedCode: embedCode || null,
      isCustomCanvaDomain: isCustomDomain,
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
    setRollbackMsg(null)
    setResult({
      warnings: (j.warnings as string[]) ?? [],
      sections: (j.sectionsWritten as number) ?? 0,
      preservation: (j.animationPreservation as string) ?? 'unknown',
      importId: (j.importId as string) ?? undefined,
      runId: (j.runId as string | null) ?? null,
    })
    onApplied?.()
  })

  // Resolve the currently-active import id (from this session or site settings).
  async function activeImportId(): Promise<string | null> {
    if (result?.importId) return result.importId
    try {
      const res = await fetch(`/api/website/settings?tenant_id=${encodeURIComponent(tenantId)}`)
      const j = await res.json()
      return j?.settings?.canva_import_id ?? null
    } catch { return null }
  }

  async function rollback(path: (importId: string) => string, label: string, needsImport = true) {
    setBusy(true); setError(null); setRollbackMsg(null)
    try {
      let url = path('')
      if (needsImport) {
        const importId = await activeImportId()
        if (!importId) { setError('No active Canva import to roll back.'); return }
        url = path(importId)
      }
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, websiteId: websiteId ?? tenantId }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error((j as { error?: string }).error ?? 'Request failed')
      setRollbackMsg(label)
      onApplied?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setBusy(false) }
  }

  const doUndo = () => rollback(
    (id) => `/api/website/canva/imports/${id}/undo`,
    'Canva import undone — your pre-import draft is back. Publish when ready.',
  )
  const doRestorePreImport = () => rollback(
    (id) => `/api/website/canva/imports/${id}/restore-pre-import`,
    'Pre-import draft restored. Publish when ready.',
  )
  const doRestoreLastPublished = () => rollback(
    () => `/api/website/${encodeURIComponent(websiteId ?? tenantId)}/restore-last-published`,
    'Last published version restored into your draft. Publish to go live again.',
    false,
  )

  async function doPublish() {
    const id = registryWebsiteId
    if (!id) { setError('No website record to publish yet. Save the draft first.'); return }
    setBusy(true); setError(null); setRollbackMsg(null)
    try {
      const res = await fetch(`/api/websites/${id}/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error((j as { error?: string }).error ?? 'Publish failed')
      setRollbackMsg('Published to your live site. Open the live URL from My Sites & Apps.')
      onApplied?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setBusy(false) }
  }

  // ── Event-website (config-backed) lifecycle ────────────────────────────────
  async function doSaveEventDraft() {
    setBusy(true); setError(null); setSavedMsg(null)
    try {
      const res = await fetch('/api/websites/canva/save-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          websiteId: eventDraft?.websiteId ?? initialWebsiteId ?? null,
          name: siteName || null,
          sourceType: sourceMode,
          importMode,
          canvaUrl: canvaUrl || null,
          embedCode: embedCode || null,
          isCustomCanvaDomain: isCustomDomain,
          settings: opts,
          povEnabled: !!povEventId,
          povEventId: povEventId ?? null,
        }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error((j as { error?: string }).error ?? 'Could not save the Canva draft.')
      const next: EventDraftState = {
        websiteId: j.websiteId, publicSlug: j.publicSlug, status: j.status,
        draftPreviewUrl: j.draftPreviewUrl, liveUrl: j.liveUrl, importId: j.importId ?? null,
      }
      setEventDraft(next)
      setSavedMsg('Canva event website draft saved.')
      if (Array.isArray(j.warnings) && j.warnings.length) {
        setResult({ warnings: j.warnings as string[], sections: 0, preservation: 'preserve', importId: j.importId, runId: null })
      }
      onSaved?.({ websiteId: j.websiteId, publicSlug: j.publicSlug, status: j.status })
      onApplied?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setBusy(false) }
  }

  async function doEventPublish() {
    if (!eventDraft?.websiteId) { setError('Save the Canva draft before publishing.'); return }
    setBusy(true); setError(null); setSavedMsg(null)
    try {
      const res = await fetch(`/api/websites/${eventDraft.websiteId}/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error((j as { error?: string }).error ?? 'Publish failed')
      setEventDraft((d) => (d ? { ...d, status: 'published', liveUrl: j.liveUrl ?? d.liveUrl } : d))
      setSavedMsg('Your Canva event website is live.')
      onApplied?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setBusy(false) }
  }

  async function doEventRollback(action: 'undo' | 'restore-last-published') {
    if (!eventDraft?.websiteId) { setError('Save the Canva draft first.'); return }
    setBusy(true); setError(null); setSavedMsg(null)
    try {
      const res = await fetch(`/api/websites/${eventDraft.websiteId}/canva/rollback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, action }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error((j as { error?: string }).error ?? 'Request failed')
      setSavedMsg(action === 'undo'
        ? 'Canva import undone — your previous draft is back.'
        : 'Last published version restored into your draft.')
      onApplied?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setBusy(false) }
  }

  async function doPdfConvert() {
    if (!pdfFile) { setError('Upload a Canva PDF export first.'); return }
    setBusy(true); setError(null); setSavedMsg(null); setPdfStep('Uploading PDF…')
    try {
      const fd = new FormData()
      fd.append('tenant_id', tenantId)
      if (eventDraft?.websiteId) fd.append('websiteId', eventDraft.websiteId)
      fd.append('websiteName', siteName || '')
      fd.append('povEnabled', povEventId ? 'true' : 'false')
      if (povEventId) fd.append('povEventId', povEventId)
      fd.append('conversionStyle', conversionStyle)
      fd.append('animationRecreationLevel', animationLevel)
      fd.append('file', pdfFile)

      const up = await fetch('/api/website/canva/pdf/upload', { method: 'POST', body: fd })
      const upJson = await up.json()
      if (!up.ok || !upJson.ok) {
        if (upJson?.hasRequiredSchema === false) {
          setPdfDiag({ hasRequiredSchema: false, lastError: upJson.error, missingColumns: upJson.missingColumns ?? [], sourceType: 'pdf_upload', pdfFileName: pdfFile.name })
        }
        throw new Error((upJson as { error?: string }).error ?? 'PDF upload failed')
      }

      setPdfStep('Converting with AI — recreating your design…')
      const conv = await fetch('/api/website/canva/pdf/convert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, websiteId: upJson.websiteId, importId: upJson.importId }),
      })
      const convJson = await conv.json()
      if (!conv.ok || !convJson.ok) throw new Error((convJson as { error?: string }).error ?? 'AI conversion failed')

      setEventDraft({
        websiteId: convJson.websiteId, publicSlug: upJson.publicSlug, status: 'draft',
        draftPreviewUrl: convJson.draftPreviewUrl, liveUrl: convJson.liveUrl, importId: upJson.importId,
      })
      setPdfDiag({
        websiteId: convJson.websiteId, importId: upJson.importId, sourceType: 'pdf_upload',
        pdfFileName: pdfFile.name, pdfStoragePath: upJson.pdfStoragePath, pageCount: convJson.pageCount,
        aiConversionStatus: 'converted', convertedSections: convJson.sectionCount,
        animationMappingCount: convJson.animationMappingCount, povEnabled: !!povEventId, povEventId: povEventId ?? null,
        hasRequiredSchema: true, draftSaved: true, lastError: null,
        warnings: convJson.warnings ?? [],
      })
      setPdfStep(null)
      setSavedMsg(`Canva PDF converted to website draft — ${convJson.sectionCount} section(s) created.`)
      onSaved?.({ websiteId: convJson.websiteId, publicSlug: upJson.publicSlug, status: 'draft' })
      onApplied?.()
    } catch (e) {
      setPdfStep(null)
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setBusy(false) }
  }

  function doTestEmbed() {
    setError(null)
    const source = parseCanvaEmbedSource({
      canvaUrl: canvaUrl || null,
      embedCode: embedCode || null,
      isCustomCanvaDomain: isCustomDomain,
    })
    setEmbedLoadState(null)
    setTestSource(source)
    if (!source.iframeSrc) {
      setError(source.warnings[0] ?? 'Could not resolve a Canva embed from the provided input.')
    }
  }

  function copyDraftLink() {
    if (!eventDraft?.draftPreviewUrl) return
    const full = `${window.location.origin}${eventDraft.draftPreviewUrl}`
    navigator.clipboard?.writeText(full).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }).catch(() => {})
  }

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

      {eventWebsiteMode && (
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-white/70">Event website name</label>
          <input className={inputCls} value={siteName} onChange={(e) => setSiteName(e.target.value)}
            placeholder="e.g. Sarah & James Wedding" />
          <p className="text-2xs text-white/30 leading-relaxed">
            This creates a separate Invitation/Event website with its own URL — it never changes your business website.
          </p>
        </div>
      )}

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
        <SrcTab icon={FileText} label="Upload Canva PDF Export" on={sourceMode === 'pdf_upload'} onClick={() => setSourceMode('pdf_upload')} />
        <SrcTab icon={Upload} label="Upload HTML"   on={sourceMode === 'html_upload'} onClick={() => setSourceMode('html_upload')} />
        <SrcTab icon={Images} label="Upload assets" on={sourceMode === 'asset_upload'} onClick={() => setSourceMode('asset_upload')} />
      </div>

      {sourceMode === 'canva_url' && (
        <div className="space-y-1.5">
          <input className={inputCls} value={canvaUrl} onChange={(e) => setCanvaUrl(e.target.value)}
            placeholder="https://your-event.canva.site or https://www.canva.com/design/XXXX/view" />
          <p className="text-2xs text-white/30 leading-relaxed">
            Canva websites may publish on canva.site or on your own custom domain. If you use a custom
            domain, enable “Custom Canva Domain” below.
          </p>
        </div>
      )}
      {sourceMode === 'embed_code' && (
        <div className="space-y-1.5">
          <textarea className={cn(inputCls, 'h-24 py-2')} value={embedCode} onChange={(e) => setEmbedCode(e.target.value)}
            placeholder='<iframe src="https://www.canva.com/design/.../view?embed" ...></iframe>' />
          <p className="text-2xs text-white/30 leading-relaxed">
            Recommended for the most reliable embedding. We extract only the iframe src — scripts and unsafe HTML are discarded.
          </p>
        </div>
      )}

      <p className="text-2xs text-white/30 leading-relaxed">
        Canva published websites may use canva.site or your own custom domain. For best embedding, use Canva’s official embed code. Custom domains may block iframe embedding depending on security settings.
      </p>
      {(sourceMode === 'html_upload' || sourceMode === 'asset_upload') && (
        <input type="file" accept={sourceMode === 'html_upload' ? '.html,.htm,text/html' : 'image/*,.zip'}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white/80" />
      )}

      {sourceMode === 'pdf_upload' && (
        <div className="rounded-xl border border-surface-border bg-graphite-900/40 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gold-400" />
            <p className="text-sm font-semibold text-white">Upload Canva PDF Export</p>
          </div>
          <p className="text-2xs text-white/40 leading-relaxed">
            Upload a Canva PDF export to turn the design into an editable NexoraNow event website. PDF exports are static, so Canva animations will be recreated using NexoraNow animations where possible.
          </p>

          <input type="file" accept="application/pdf,.pdf"
            onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white/80" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="block text-2xs font-medium text-white/60 flex items-center gap-1"><LayoutGrid className="h-3 w-3" /> Conversion style</span>
              <select className={inputCls} value={conversionStyle} onChange={(e) => setConversionStyle(e.target.value as ConversionStyle)}>
                <option value="faithful">Faithful to Canva</option>
                <option value="clean_premium">Clean premium rebuild</option>
                <option value="mobile_first">Mobile-first event website</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-2xs font-medium text-white/60 flex items-center gap-1"><Wand2 className="h-3 w-3" /> Animation recreation</span>
              <select className={inputCls} value={animationLevel} onChange={(e) => setAnimationLevel(e.target.value as AnimationLevel)}>
                <option value="subtle">Subtle</option>
                <option value="balanced">Balanced</option>
                <option value="premium_cinematic">Premium cinematic</option>
              </select>
            </label>
          </div>

          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-2xs text-amber-300 leading-relaxed">
            PDF exports are static, so Canva animations are recreated as NexoraNow animations where possible. For exact Canva animation playback, use Preserve Canva Mode with a Canva URL/embed.
          </div>

          <Button variant="primary" onClick={doPdfConvert} loading={busy}>
            <Wand2 className="h-4 w-4" /> Analyze &amp; Convert to Website Draft
          </Button>
          {pdfStep && <p className="text-2xs text-sky-300">{pdfStep}</p>}

          {eventDraft?.websiteId && pdfDiag && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => window.open(eventDraft.draftPreviewUrl, '_blank')}>
                <Eye className="h-4 w-4" /> Preview Draft
              </Button>
              <Button variant="primary" size="sm" onClick={doEventPublish} loading={busy}>
                <Rocket className="h-4 w-4" /> Publish to Site
              </Button>
              <Button variant="secondary" size="sm" onClick={() => doEventRollback('undo')} loading={busy}>Undo Import</Button>
              <Button variant="secondary" size="sm" onClick={() => doEventRollback('restore-last-published')} loading={busy}>Restore Last Published Version</Button>
              <Button variant="ghost" size="sm" onClick={() => window.open('/website/sites', '_blank')}>
                <ExternalLink className="h-4 w-4" /> Open My Sites &amp; Apps
              </Button>
              {eventDraft.status === 'published' && (
                <Button variant="ghost" size="sm" onClick={() => window.open(eventDraft.liveUrl, '_blank')}>
                  <ExternalLink className="h-4 w-4" /> Open Live Site
                </Button>
              )}
            </div>
          )}

          {pdfDiag && pdfDiag.hasRequiredSchema === false && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-2xs text-red-300 leading-relaxed">
              Your app code is ahead of your Supabase schema. Run the latest migration
              (<span className="font-mono">087_fix_canva_pdf_import_schema</span>) and refresh the schema cache.
              {Array.isArray(pdfDiag.missingColumns) && (pdfDiag.missingColumns as string[]).length > 0 && (
                <span className="block mt-1 text-white/50">Missing: {(pdfDiag.missingColumns as string[]).join(', ')}</span>
              )}
            </div>
          )}

          {pdfDiag && (
            <div className="rounded-lg border border-surface-border bg-graphite-900/60 p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-2xs text-white/50">
              <Diag k="websiteId" v={String(pdfDiag.websiteId ?? '—')} />
              <Diag k="importId" v={String(pdfDiag.importId ?? '—')} />
              <Diag k="sourceType" v="pdf_upload" />
              <Diag k="PDF file" v={String(pdfDiag.pdfFileName ?? '—')} />
              <Diag k="storage path" v={String(pdfDiag.pdfStoragePath ?? '—')} />
              <Diag k="page count" v={String(pdfDiag.pageCount ?? '—')} />
              <Diag k="AI conversion" v={String(pdfDiag.aiConversionStatus ?? '—')} />
              <Diag k="converted sections" v={String(pdfDiag.convertedSections ?? '—')} />
              <Diag k="animation mappings" v={String(pdfDiag.animationMappingCount ?? '—')} />
              <Diag k="has required schema" v={pdfDiag.hasRequiredSchema === false ? 'no' : 'yes'} />
              <Diag k="draft saved" v={pdfDiag.draftSaved ? 'yes' : 'no'} />
              <Diag k="publish button visible" v={eventDraft?.websiteId ? 'yes' : 'no'} />
              <Diag k="POV enabled" v={pdfDiag.povEnabled ? 'yes' : 'no'} />
              <Diag k="last error" v={String(pdfDiag.lastError ?? 'none')} />
            </div>
          )}
        </div>
      )}

      {/* Custom Canva domain confirmation */}
      {(sourceMode === 'canva_url' || sourceMode === 'embed_code') && importMode === 'preserve' && (
        <label className="flex items-start gap-3 rounded-xl border border-surface-border bg-graphite-900/40 p-3 cursor-pointer">
          <input type="checkbox" checked={isCustomDomain} onChange={(e) => setIsCustomDomain(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-gold-500" />
          <span>
            <span className="block text-xs font-medium text-white">This is a custom domain connected to my Canva website</span>
            <span className="block text-2xs text-white/40 mt-0.5">
              Use this when your Canva website is published on your own domain instead of canva.site.
            </span>
          </span>
        </label>
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

      {/* Test Embed — live in-panel preview before saving/publishing. */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={doTestEmbed}>
          <Eye className="h-4 w-4" /> Test Embed
        </Button>
      </div>

      {testSource && (
        <div className="rounded-xl border border-surface-border bg-graphite-900/60 p-4 space-y-3 text-xs text-white/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <Diag k="detected source type" v={testSource.sourceType} />
            <Diag k="validation mode" v={testSource.validationMode} />
            <Diag k="source domain" v={testSource.sourceDomain ?? '—'} />
            <Diag k="can attempt iframe" v={testSource.canAttemptIframe ? 'yes' : 'no'} />
            <Diag k="iframe src" v={testSource.iframeSrc ?? '—'} />
            <Diag k="preview load state" v={embedLoadState ?? 'loading'} />
          </div>
          {testSource.sourceType === 'custom_domain' && (
            <p className="text-2xs text-amber-300/80 leading-relaxed">
              Custom domains can block iframe embedding. If that happens, NexoraNow shows a polished open-site fallback while keeping Event Camera and Gallery available.
            </p>
          )}
          {testSource.iframeSrc && (
            <div className="rounded-lg overflow-hidden border border-white/10">
              <CanvaPreserveEmbed
                sourceUrl={canvaUrl || null}
                embedCode={embedCode || null}
                isCustomCanvaDomain={isCustomDomain}
                title="Canva embed preview"
                aspectPercent={62}
                showNativeActions={false}
                onStatusChange={(s) => setEmbedLoadState(s)}
              />
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-200 space-y-2">
          <p className="font-medium">Applied to your event website draft — your live site is unchanged until you publish.</p>
          <p>{result.sections} section(s) written · animation: {result.preservation}</p>
          {!!result.warnings.length && (
            <ul className="list-disc list-inside text-amber-300/80">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
        </div>
      )}

      {rollbackMsg && (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4 text-xs text-sky-200">{rollbackMsg}</div>
      )}

      {savedMsg && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-200">{savedMsg}</div>
      )}

      {eventWebsiteMode ? (
        <>
          {/* Primary: Save Draft → creates/uses a real Invitation/Event record. */}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={doPreview} loading={busy}>
              <Eye className="h-4 w-4" /> Preview Canva Import
            </Button>
            <Button variant="primary" onClick={doSaveEventDraft} loading={busy}>
              <Save className="h-4 w-4" /> Save Draft
            </Button>
          </div>

          {eventDraft?.websiteId && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => window.open(eventDraft.draftPreviewUrl, '_blank')}>
                <Eye className="h-4 w-4" /> Preview Draft
              </Button>
              <Button variant="primary" size="sm" onClick={doEventPublish} loading={busy}>
                <Rocket className="h-4 w-4" /> Publish to Site
              </Button>
              <Button variant="ghost" size="sm" onClick={copyDraftLink}>
                <Copy className="h-4 w-4" /> {copied ? 'Copied!' : 'Copy Draft Preview Link'}
              </Button>
              {eventDraft.status === 'published' && (
                <Button variant="ghost" size="sm" onClick={() => window.open(eventDraft.liveUrl, '_blank')}>
                  <ExternalLink className="h-4 w-4" /> Open Live Site
                </Button>
              )}
            </div>
          )}

          {eventDraft?.websiteId && (
            <div className="rounded-xl border border-surface-border bg-graphite-900/40 p-4 space-y-2">
              <p className="text-xs font-medium text-white/70 flex items-center gap-2">
                <RotateCcw className="h-3.5 w-3.5 text-white/40" /> Undo &amp; restore
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={() => doEventRollback('undo')} loading={busy}>Undo Canva Import</Button>
                <Button variant="secondary" size="sm" onClick={() => doEventRollback('restore-last-published')} loading={busy}>Restore Last Published Version</Button>
              </div>
            </div>
          )}

          {/* Canva Publish Diagnostics */}
          <div className="rounded-xl border border-surface-border bg-graphite-900/40">
            <button type="button" onClick={() => setShowDiag((s) => !s)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium text-white/70">
              <span>Canva Publish Diagnostics</span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', showDiag && 'rotate-180')} />
            </button>
            {showDiag && (
              <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-2xs text-white/50">
                <Diag k="websiteId" v={eventDraft?.websiteId ?? '—'} />
                <Diag k="websiteType" v="invitational" />
                <Diag k="publicSlug" v={eventDraft?.publicSlug || '—'} />
                <Diag k="status" v={eventDraft?.status ?? 'not created'} />
                <Diag k="hasDraftContent" v={eventDraft ? 'yes' : 'no'} />
                <Diag k="hasPublishedContent" v={eventDraft?.status === 'published' ? 'yes' : 'no'} />
                <Diag k="canvaImportId" v={eventDraft?.importId ?? '—'} />
                <Diag k="canvaImportMode" v={importMode} />
                <Diag k="sourceUrl" v={canvaUrl || '—'} />
                <Diag k="embedCode provided" v={embedCode ? 'yes' : 'no'} />
                <Diag k="iframeSrc" v={testSource?.iframeSrc ?? '—'} />
                <Diag k="sourceDomain" v={testSource?.sourceDomain ?? '—'} />
                <Diag k="validationMode" v={testSource?.validationMode ?? '—'} />
                <Diag k="isCustomDomain" v={isCustomDomain ? 'yes' : 'no'} />
                <Diag k="canAttemptIframe" v={testSource ? (testSource.canAttemptIframe ? 'yes' : 'no') : '—'} />
                <Diag k="embedLoadState (preview)" v={embedLoadState ?? '—'} />
                <Diag k="eventCameraUrl" v={povEventId ? 'enabled' : '—'} />
                <Diag k="draftSaved" v={eventDraft ? 'yes' : 'no'} />
                <Diag k="publishButtonVisible" v={eventDraft?.websiteId ? 'yes' : 'no'} />
                <Diag k="liveUrl" v={eventDraft?.status === 'published' ? eventDraft.liveUrl : '—'} />
                <Diag k="draftPreviewUrl" v={eventDraft?.draftPreviewUrl || '—'} />
                <Diag k="appearsInMySites" v={eventDraft ? 'yes' : 'no'} />
                <Diag k="povEnabled" v={povEventId ? 'yes' : 'no'} />
                <Diag k="povEventId" v={povEventId ?? '—'} />
                <Diag k="latestError" v={error ?? 'none'} />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={doPreview} loading={busy}>
              <Eye className="h-4 w-4" /> Preview Canva Import
            </Button>
            <Button variant="primary" onClick={doImport} loading={busy}>
              Apply to Draft <ArrowRight className="h-4 w-4" />
            </Button>
            {registryWebsiteId && (result || rollbackMsg) && (
              <Button variant="primary" onClick={doPublish} loading={busy}>
                <Rocket className="h-4 w-4" /> Publish to Site
              </Button>
            )}
            <Button variant="ghost" onClick={doRemove} loading={busy}>
              <Trash2 className="h-4 w-4" /> Remove Canva Import
            </Button>
          </div>

          {/* Safe rollback controls — a Canva import never destroys the live site. */}
          <div className="rounded-xl border border-surface-border bg-graphite-900/40 p-4 space-y-2">
            <p className="text-xs font-medium text-white/70 flex items-center gap-2">
              <RotateCcw className="h-3.5 w-3.5 text-white/40" /> Undo &amp; restore
            </p>
            <p className="text-2xs text-white/40 leading-relaxed">
              Canva imports apply to your draft first. If it didn’t go as planned, undo it or restore a previous version — your published site stays live until you publish.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={doUndo} loading={busy}>Undo Canva Import</Button>
              <Button variant="secondary" size="sm" onClick={doRestorePreImport} loading={busy}>Restore Pre-Import Version</Button>
              <Button variant="secondary" size="sm" onClick={doRestoreLastPublished} loading={busy}>Restore Last Published Version</Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Diag({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-1">
      <span className="text-white/40">{k}</span>
      <span className="text-white/70 truncate max-w-[60%] text-right" title={v}>{v}</span>
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
