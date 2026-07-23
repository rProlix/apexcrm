'use client'
// components/website/builder/AiImagesPanel.tsx
// Main AI Website Image Builder panel — plan, generate, approve, apply images.

import { useState, useCallback, useTransition } from 'react'
import { ImageIcon, Sparkles, RefreshCw, AlertCircle, CheckCircle2, Layers, Terminal } from 'lucide-react'
import { AiImagePlanCard } from './AiImagePlanCard'
import type { WebsiteImagePlan } from '@/lib/ai/websiteImageTypes'

interface Props {
  tenantId:    string
  isOwner:     boolean
  initialPlans?: WebsiteImagePlan[]
}

type PanelToast = { type: 'success' | 'error'; message: string } | null

// Error codes returned by the API when a critical dependency is missing.
type ApiErrorCode = 'MISSING_TABLE' | 'MISSING_BUCKET' | 'MISSING_API_KEY' | null

interface BlockingError {
  code:          ApiErrorCode
  message:       string
  missingTable?: string
  detail?:       string
  diagnostics?:  string
}

export function AiImagesPanel({ tenantId, isOwner, initialPlans = [] }: Props) {
  const [plans, setPlans]               = useState<WebsiteImagePlan[]>(initialPlans)
  const [loadingPlanId, setLoadingPlan] = useState<string | null>(null)
  const [globalLoading, setGlobalLoad]  = useState(false)
  const [toast, setToast]               = useState<PanelToast>(null)
  const [blockingError, setBlockingError] = useState<BlockingError | null>(null)
  const [, startTransition]             = useTransition()

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  async function apiPost(path: string, body?: Record<string, unknown>) {
    const res  = await fetch(path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json() as Record<string, unknown>
    if (!res.ok) {
      const code = (json.code as ApiErrorCode) ?? null
      if (code === 'MISSING_TABLE' || code === 'MISSING_BUCKET' || code === 'MISSING_API_KEY') {
        setBlockingError({
          code,
          message:      (json.error        as string) ?? 'Configuration error.',
          missingTable: (json.missingTable  as string | undefined),
          detail:       (json.detail        as string | undefined),
          diagnostics:  (json.diagnostics   as string | undefined),
        })
      }
      throw new Error((json.error as string) ?? 'Request failed')
    }
    return json
  }

  async function loadPlans() {
    try {
      const params = new URLSearchParams()
      if (isOwner) params.set('tenantId', tenantId)
      const res  = await fetch(`/api/website/ai-images/plan?${params}`)
      const json = await res.json() as { plans: WebsiteImagePlan[]; code?: string; error?: string; missingTable?: string; detail?: string; diagnostics?: string }
      if (!res.ok) {
        const code = (json.code as ApiErrorCode) ?? null
        if (code === 'MISSING_TABLE' || code === 'MISSING_BUCKET' || code === 'MISSING_API_KEY') {
          setBlockingError({
            code,
            message:      json.error ?? 'Configuration error.',
            missingTable: json.missingTable as string | undefined,
            detail:       json.detail as string | undefined,
            diagnostics:  json.diagnostics as string | undefined,
          })
          return
        }
        showToast('error', json.error ?? 'Failed to load plans.')
        return
      }
      setPlans(json.plans ?? [])
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load plans.')
    }
  }

  async function handleCreatePlan() {
    setGlobalLoad(true)
    try {
      const json = await apiPost('/api/website/ai-images/plan', { tenantId: isOwner ? tenantId : undefined }) as { plans: WebsiteImagePlan[] }
      setPlans(json.plans ?? [])
      showToast('success', `Created ${json.plans?.length ?? 0} image plan(s).`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Planning failed.')
    } finally {
      setGlobalLoad(false)
    }
  }

  const handleGenerate = useCallback(async (id: string) => {
    setLoadingPlan(id)
    optimisticallyUpdateStatus(id, 'generating')
    try {
      const json = await apiPost(`/api/website/ai-images/plans/${id}/generate`) as { plan: WebsiteImagePlan }
      if (json.plan) replacePlan(json.plan)
      showToast('success', 'Image generated! Preview it and apply when ready.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Generation failed.')
      optimisticallyUpdateStatus(id, 'planned')
    } finally {
      setLoadingPlan(null)
    }
  }, [])

  const handleRegenerate = useCallback(async (id: string, newPrompt?: string) => {
    setLoadingPlan(id)
    optimisticallyUpdateStatus(id, 'generating')
    try {
      const body: Record<string, unknown> = {}
      if (newPrompt) body.prompt = newPrompt
      const json = await apiPost(`/api/website/ai-images/plans/${id}/regenerate`, body) as { plan: WebsiteImagePlan }
      if (json.plan) replacePlan(json.plan)
      showToast('success', 'Image regenerated.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Regeneration failed.')
      await loadPlans()
    } finally {
      setLoadingPlan(null)
    }
  }, [])

  const handleApply = useCallback(async (id: string) => {
    setLoadingPlan(id)
    try {
      await apiPost(`/api/website/ai-images/plans/${id}/apply`)
      optimisticallyUpdateStatus(id, 'applied')
      showToast('success', 'Image applied to your website section!')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Apply failed.')
    } finally {
      setLoadingPlan(null)
    }
  }, [])

  const handleGenerateAndApply = useCallback(async (id: string) => {
    setLoadingPlan(id)
    optimisticallyUpdateStatus(id, 'generating')
    try {
      const json = await apiPost(
        `/api/website/ai-images/plans/${id}/generate-and-apply`,
      ) as { plan: WebsiteImagePlan; applied: boolean; applySkipped?: boolean }
      if (json.plan) replacePlan(json.plan)
      const msg = json.applied
        ? 'Image generated and applied to your website!'
        : json.applySkipped
        ? 'Image generated (no section linked — apply manually when ready).'
        : 'Image generated.'
      showToast('success', msg)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Generate + Apply failed.')
      await loadPlans()
    } finally {
      setLoadingPlan(null)
    }
  }, [])

  const handleReject = useCallback(async (id: string) => {
    setLoadingPlan(id)
    try {
      await apiPost(`/api/website/ai-images/plans/${id}/reject`)
      optimisticallyUpdateStatus(id, 'rejected')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Reject failed.')
    } finally {
      setLoadingPlan(null)
    }
  }, [])

  const handleApprove = useCallback(async (id: string) => {
    setLoadingPlan(id)
    try {
      await apiPost(`/api/website/ai-images/plans/${id}/approve`)
      optimisticallyUpdateStatus(id, 'approved')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Approve failed.')
    } finally {
      setLoadingPlan(null)
    }
  }, [])

  async function handleBulkGenerate() {
    const eligible = plans.filter(p => p.status === 'planned' || p.status === 'approved')
    if (!eligible.length) return
    setGlobalLoad(true)
    try {
      const json = await apiPost('/api/website/ai-images/auto-generate', {
        tenantId: isOwner ? tenantId : undefined,
        planIds:  eligible.map(p => p.id),
      }) as { succeeded: number; failed: number }
      showToast('success', `Generated ${json.succeeded} image(s). ${json.failed > 0 ? `${json.failed} failed.` : ''}`)
      await loadPlans()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Bulk generation failed.')
    } finally {
      setGlobalLoad(false)
    }
  }

  async function handleBulkApply() {
    const generated = plans.filter(p => p.status === 'generated' && p.generated_asset_url && p.section_id)
    if (!generated.length) return
    setGlobalLoad(true)
    try {
      for (const plan of generated) {
        await apiPost(`/api/website/ai-images/plans/${plan.id}/apply`)
      }
      await loadPlans()
      showToast('success', `Applied ${generated.length} image(s) to website sections.`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Bulk apply failed.')
    } finally {
      setGlobalLoad(false)
    }
  }

  function optimisticallyUpdateStatus(id: string, status: WebsiteImagePlan['status']) {
    startTransition(() => {
      setPlans(prev => prev.map(p => p.id === id ? { ...p, status } : p))
    })
  }

  function replacePlan(updated: WebsiteImagePlan) {
    startTransition(() => {
      setPlans(prev => prev.map(p => p.id === updated.id ? updated : p))
    })
  }

  const activePlans   = plans.filter(p => p.status !== 'rejected' && p.status !== 'disabled')
  const rejectedPlans = plans.filter(p => p.status === 'rejected')
  const hasGenerated  = plans.some(p => p.status === 'generated' && p.generated_asset_url && p.section_id)
  const hasEligible   = plans.some(p => p.status === 'planned' || p.status === 'approved')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white/90">
            <ImageIcon className="h-5 w-5 text-violet-400" />
            AI Website Images
          </h2>
          <p className="mt-1 text-sm text-white/45">
            AI analyzes your website content and generates premium images for each section.
          </p>
        </div>
        <button
          onClick={() => void loadPlans()}
          disabled={globalLoading}
          className="p-2 rounded-xl text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors disabled:opacity-40"
          aria-label="Refresh plans"
        >
          <RefreshCw className={`h-4 w-4 ${globalLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border ${
          toast.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* Blocking configuration error */}
      {blockingError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-400">
            <Terminal className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold">
              {blockingError.code === 'MISSING_TABLE'   && (
                blockingError.missingTable
                  ? `Database table missing: ${blockingError.missingTable}`
                  : 'Database table missing'
              )}
              {blockingError.code === 'MISSING_BUCKET'  && 'Storage bucket missing'}
              {blockingError.code === 'MISSING_API_KEY' && 'AI image service configuration missing'}
              {!blockingError.code                      && 'Configuration error'}
            </span>
          </div>

          <p className="text-xs text-red-300/80 leading-relaxed">{blockingError.message}</p>

          {blockingError.detail && (
            <p className="text-[11px] text-white/30 font-mono break-all leading-relaxed bg-black/30 rounded-lg px-3 py-2">
              {blockingError.detail}
            </p>
          )}

          {blockingError.code === 'MISSING_TABLE' && (
            <div className="text-[11px] text-white/40 space-y-1 font-mono bg-black/30 rounded-xl p-3">
              <p className="text-white/60 font-sans font-semibold not-italic mb-1">Fix steps:</p>
              <p>1. Open Supabase Dashboard → SQL Editor</p>
              <p>2. Run: <span className="text-violet-300">054_website_image_plans_complete.sql</span></p>
              <p>3. Run: <span className="text-violet-300">058_schema_check_helpers.sql</span></p>
              <p>4. Verify you are running migrations on the <span className="text-yellow-300">same Supabase project</span> as NEXT_PUBLIC_SUPABASE_URL</p>
              <p>5. Redeploy on Vercel, then click &quot;Retry after fixing&quot; below</p>
            </div>
          )}

          {blockingError.code === 'MISSING_BUCKET' && (
            <div className="text-[11px] text-white/40 space-y-1 font-mono bg-black/30 rounded-xl p-3">
              <p className="text-white/60 font-sans font-semibold not-italic mb-1">Fix steps:</p>
              <p>1. Open Supabase Dashboard → Storage → New bucket</p>
              <p>2. Name: <span className="text-violet-300">website-assets</span> — Public: on</p>
              <p>3. Or re-run: <span className="text-violet-300">054_website_image_plans_complete.sql</span></p>
            </div>
          )}

          {blockingError.code === 'MISSING_API_KEY' && (
            <div className="text-[11px] text-white/40 space-y-1 font-mono bg-black/30 rounded-xl p-3">
              <p className="text-white/60 font-sans font-semibold not-italic mb-1">Fix steps:</p>
              <p>1. Go to Vercel Dashboard → Project → Settings → Environment Variables</p>
              <p>2. Add the server-side AI provider credential documented for this deployment.</p>
              <p>3. Redeploy</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => { setBlockingError(null); void loadPlans() }}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry after fixing
            </button>
            {blockingError.diagnostics && (
              <a
                href={blockingError.diagnostics}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-violet-400/60 hover:text-violet-300 transition-colors underline underline-offset-2"
              >
                View diagnostics →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-violet-300">How AI Images Work</span>
        </div>
        <ul className="space-y-1 text-xs text-white/50 pl-6 list-disc">
          <li>AI analysis reviews your website structure and decides which images are needed and why.</li>
          <li>AI image generation creates each image from a commercial photography prompt.</li>
          <li>Images are saved to your Supabase Storage and linked to the correct sections.</li>
          <li>Existing product images are never overwritten.</li>
          <li>You can preview, regenerate, edit prompts, approve, apply, or reject each image.</li>
        </ul>
      </div>

      {/* Primary action */}
      {!plans.length && (
        <button
          onClick={() => void handleCreatePlan()}
          disabled={globalLoading}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all duration-150 disabled:opacity-50 shadow-lg shadow-violet-500/20"
        >
          {globalLoading ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Planning images…</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Analyze Site & Plan Images</>
          )}
        </button>
      )}

      {/* Bulk actions */}
      {plans.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void handleCreatePlan()}
            disabled={globalLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Re-plan
          </button>
          {hasEligible && (
            <button
              onClick={() => void handleBulkGenerate()}
              disabled={globalLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors disabled:opacity-40"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Generate All ({plans.filter(p => p.status === 'planned' || p.status === 'approved').length})
            </button>
          )}
          {hasGenerated && (
            <button
              onClick={() => void handleBulkApply()}
              disabled={globalLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-gold-500/10 text-gold-400 border border-gold-500/20 hover:bg-gold-500/20 transition-colors disabled:opacity-40"
            >
              <Layers className="h-3.5 w-3.5" />
              Apply All to Site
            </button>
          )}
        </div>
      )}

      {/* Plans list */}
      {activePlans.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider">
            {activePlans.length} Image Plan{activePlans.length !== 1 ? 's' : ''}
          </p>
          {activePlans.map(plan => (
            <AiImagePlanCard
              key={plan.id}
              plan={plan}
              isLoading={loadingPlanId === plan.id || globalLoading}
              onGenerate={id => void handleGenerate(id)}
              onRegenerate={(id, p) => void handleRegenerate(id, p)}
              onApply={id => void handleApply(id)}
              onGenerateAndApply={id => void handleGenerateAndApply(id)}
              onReject={id => void handleReject(id)}
              onApprove={id => void handleApprove(id)}
            />
          ))}
        </div>
      )}

      {/* Rejected */}
      {rejectedPlans.length > 0 && (
        <details className="group">
          <summary className="text-xs text-white/25 cursor-pointer hover:text-white/40 transition-colors list-none">
            {rejectedPlans.length} rejected plan{rejectedPlans.length !== 1 ? 's' : ''} (hidden)
          </summary>
          <div className="mt-2 space-y-2 opacity-50">
            {rejectedPlans.map(plan => (
              <AiImagePlanCard
                key={plan.id}
                plan={plan}
                isLoading={false}
                onGenerate={() => {}}
                onRegenerate={() => {}}
                onApply={() => {}}
                onGenerateAndApply={() => {}}
                onReject={() => {}}
                onApprove={() => {}}
              />
            ))}
          </div>
        </details>
      )}

      {/* Empty state */}
      {!plans.length && !globalLoading && (
        <div className="text-center py-12 space-y-3">
          <ImageIcon className="h-10 w-10 text-white/10 mx-auto" />
          <p className="text-sm text-white/30">No image plans yet.</p>
          <p className="text-xs text-white/20 max-w-xs mx-auto">
            Click "Analyze Site & Plan Images" to create an AI-assisted image plan.
          </p>
        </div>
      )}
    </div>
  )
}
