'use client'
// components/website/builder/AiImagePlanCard.tsx
// Renders one AI image plan with full status, debug info, and action buttons.

import { useState } from 'react'
import Image from 'next/image'
import {
  ImageIcon, Wand2, CheckCircle2, XCircle, RotateCcw,
  ChevronDown, ChevronUp, Zap, Star, Clock, AlertCircle,
  ExternalLink, Database, HardDrive,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WebsiteImagePlan } from '@/lib/ai/websiteImageTypes'

interface Props {
  plan:                WebsiteImagePlan
  onGenerate:          (id: string) => void
  onRegenerate:        (id: string, newPrompt?: string) => void
  onApply:             (id: string) => void
  onGenerateAndApply:  (id: string) => void
  onReject:            (id: string) => void
  onApprove:           (id: string) => void
  isLoading?:          boolean
}

const STATUS_CONFIG = {
  planned:    { label: 'Planned',    color: 'text-blue-400',    bg: 'bg-blue-500/10',    icon: Clock },
  approved:   { label: 'Approved',   color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
  generating: { label: 'Generating', color: 'text-amber-400',   bg: 'bg-amber-500/10',   icon: Wand2 },
  generated:  { label: 'Generated',  color: 'text-violet-400',  bg: 'bg-violet-500/10',  icon: ImageIcon },
  applied:    { label: 'Applied',    color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
  rejected:   { label: 'Rejected',   color: 'text-red-400',     bg: 'bg-red-500/10',     icon: XCircle },
  disabled:   { label: 'Disabled',   color: 'text-white/30',    bg: 'bg-white/5',         icon: XCircle },
} as const

const ROLE_LABELS: Record<string, string> = {
  hero_main:              'Hero Image',
  hero_background:        'Hero Background',
  about_feature:          'About Section',
  service_card:           'Service Image',
  gallery_cover:          'Gallery Cover',
  gallery_item:           'Gallery Item',
  product_banner:         'Product Banner',
  category_banner:        'Category Banner',
  contact_banner:         'Contact Banner',
  testimonial_background: 'Testimonial Background',
  rewards_promo_banner:   'Rewards Banner',
  cta_banner:             'CTA Banner',
  promo_banner:           'Promo Banner',
  feature_image:          'Feature Image',
  section_background:     'Section Background',
  other:                  'Image',
}

export function AiImagePlanCard({
  plan,
  onGenerate,
  onRegenerate,
  onApply,
  onGenerateAndApply,
  onReject,
  onApprove,
  isLoading,
}: Props) {
  const [expanded, setExpanded]       = useState(false)
  const [editingPrompt, setEditing]   = useState(false)
  const [promptDraft, setPromptDraft] = useState(plan.prompt)

  const status     = STATUS_CONFIG[plan.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.planned
  const StatusIcon = status.icon
  const roleLabel  = ROLE_LABELS[plan.image_role] ?? plan.image_role

  const isActionable        = !isLoading && plan.status !== 'applied' && plan.status !== 'rejected' && plan.status !== 'disabled'
  const canGenerate         = isActionable && (plan.status === 'planned' || plan.status === 'approved')
  const canGenerateAndApply = isActionable && (plan.status === 'planned' || plan.status === 'approved') && !!plan.section_id
  const canRegenerate       = isActionable && plan.status === 'generated'
  const canApply            = isActionable && plan.status === 'generated' && !!plan.generated_asset_url && !!plan.section_id
  const canApprove          = isActionable && plan.status === 'planned'
  const canReject           = isActionable && plan.status !== 'rejected'

  // Compute storage/apply state for display
  const hasImage         = !!plan.generated_asset_url
  const hasStoragePath   = !!plan.generated_storage_path
  const isApplied        = plan.status === 'applied'
  const missingSection   = !plan.section_id

  function handleRegenerate() {
    if (editingPrompt && promptDraft !== plan.prompt) {
      onRegenerate(plan.id, promptDraft)
    } else {
      onRegenerate(plan.id)
    }
    setEditing(false)
  }

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-all duration-200',
      isApplied                  ? 'border-emerald-500/30 bg-emerald-500/5' :
      plan.status === 'generated'? 'border-violet-500/30 bg-violet-500/5' :
      plan.status === 'rejected' ? 'border-white/5 bg-white/2 opacity-50' :
      plan.status === 'generating'? 'border-amber-500/30 bg-amber-500/5 animate-pulse' :
      'border-surface-border bg-surface-card',
    )}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        {plan.priority <= 10 && (
          <span title="High priority">
            <Star className="h-3.5 w-3.5 text-yellow-400 mt-0.5 shrink-0" fill="currentColor" />
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white/90 truncate">
              {plan.title ?? roleLabel}
            </span>
            {/* Status badge */}
            <span className={cn(
              'flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide',
              status.color, status.bg,
            )}>
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </span>
            {/* Section type badge */}
            {plan.section_type && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 uppercase tracking-wide">
                {plan.section_type}
              </span>
            )}
            {/* Applied badge */}
            {isApplied && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wide flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                On Site
              </span>
            )}
            {/* No section warning */}
            {missingSection && plan.status !== 'rejected' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                No section
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-white/45 line-clamp-2">{plan.reason}</p>

          {/* Generated but not stored warning */}
          {hasImage && !hasStoragePath && (
            <p className="mt-1 text-[10px] text-amber-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Image URL set but no storage path recorded.
            </p>
          )}
        </div>

        <button
          onClick={() => setExpanded(e => !e)}
          className="p-1 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors shrink-0"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Generated image preview */}
      {plan.generated_asset_url && (
        <div className="px-4 pb-2">
          <div
            className="relative rounded-xl overflow-hidden border border-white/10 bg-black/20"
            style={{ aspectRatio: plan.aspect_ratio?.replace(':', '/') ?? '16/9' }}
          >
            <Image
              src={plan.generated_asset_url}
              alt={plan.generated_alt_text ?? plan.title ?? 'Generated image'}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              unoptimized
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
              <span className="text-[10px] px-2 py-1 rounded-lg bg-black/60 text-violet-300 font-medium">
                AI Generated
              </span>
              <a
                href={plan.generated_asset_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded-lg bg-black/60 text-white/50 hover:text-white/90 transition-colors"
                title="Open image in new tab"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3 mt-1">
          {/* Prompt */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Imagen Prompt</p>
              <button
                onClick={() => setEditing(e => !e)}
                className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
              >
                {editingPrompt ? 'Cancel edit' : 'Edit prompt'}
              </button>
            </div>
            {editingPrompt ? (
              <textarea
                value={promptDraft}
                onChange={e => setPromptDraft(e.target.value)}
                className="w-full text-xs bg-black/20 border border-violet-500/30 rounded-lg px-3 py-2 text-white/80 resize-none focus:outline-none focus:border-violet-400 min-h-[80px]"
              />
            ) : (
              <p className="text-xs text-white/50 font-mono bg-black/20 rounded-lg px-3 py-2 line-clamp-3">
                {plan.prompt}
              </p>
            )}
          </div>

          {/* Business goal + visual style */}
          {plan.business_goal && (
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">Business Goal</p>
              <p className="text-xs text-white/60">{plan.business_goal}</p>
            </div>
          )}
          {plan.visual_style && (
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">Visual Style</p>
              <p className="text-xs text-white/60">{plan.visual_style}</p>
            </div>
          )}

          {/* Storage info */}
          <div className="rounded-xl bg-black/20 border border-white/5 p-3 space-y-2">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              Storage
            </p>
            <div className="space-y-1 text-[11px]">
              <div className="flex items-start gap-2">
                <span className="text-white/30 w-20 shrink-0">Bucket</span>
                <span className="text-white/60 font-mono">website-assets</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/30 w-20 shrink-0">Path</span>
                <span className={cn('font-mono break-all', plan.generated_storage_path ? 'text-white/60' : 'text-white/20 italic')}>
                  {plan.generated_storage_path ?? 'Not yet uploaded'}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/30 w-20 shrink-0">Public URL</span>
                {plan.generated_asset_url ? (
                  <a
                    href={plan.generated_asset_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 hover:text-violet-300 font-mono break-all text-[10px] flex items-center gap-0.5"
                  >
                    {plan.generated_asset_url.slice(0, 60)}…
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  </a>
                ) : (
                  <span className="text-white/20 italic">Not generated yet</span>
                )}
              </div>
            </div>
          </div>

          {/* DB / section info */}
          <div className="rounded-xl bg-black/20 border border-white/5 p-3 space-y-2">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider flex items-center gap-1">
              <Database className="h-3 w-3" />
              Targets
            </p>
            <div className="space-y-1 text-[11px]">
              <div className="flex items-start gap-2">
                <span className="text-white/30 w-20 shrink-0">Plan ID</span>
                <span className="text-white/40 font-mono">{plan.id}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/30 w-20 shrink-0">Section ID</span>
                <span className={cn('font-mono', plan.section_id ? 'text-white/60' : 'text-amber-400/70 italic')}>
                  {plan.section_id ?? 'No section linked'}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/30 w-20 shrink-0">Section type</span>
                <span className="text-white/60">{plan.section_type ?? '—'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/30 w-20 shrink-0">Image role</span>
                <span className="text-white/60">{roleLabel}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/30 w-20 shrink-0">Aspect ratio</span>
                <span className="text-white/60">{plan.aspect_ratio ?? '16:9'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/30 w-20 shrink-0">Model</span>
                <span className="text-white/60 font-mono">imagen-4.0-ultra-generate-001</span>
              </div>
            </div>
          </div>

          {/* Section link warning */}
          {!plan.section_id && (
            <div className="flex items-center gap-2 text-[11px] text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              No section is linked to this plan. Re-plan to match sections, or apply manually via test-apply.
            </div>
          )}

          {/* Apply verification */}
          {isApplied && (
            <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Applied to section. Visit your live website to see the image.
            </div>
          )}
          {plan.status === 'generated' && plan.generated_asset_url && plan.section_id && (
            <div className="flex items-center gap-2 text-[11px] text-white/40 bg-white/3 border border-white/10 rounded-xl px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Generated but not yet applied to the website section. Click "Apply to Site" or "Generate + Apply".
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      {plan.status !== 'rejected' && plan.status !== 'disabled' && plan.status !== 'applied' && (
        <div className="flex items-center gap-2 px-4 pb-4 flex-wrap">
          {canApprove && (
            <button
              onClick={() => onApprove(plan.id)}
              disabled={!isActionable}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve
            </button>
          )}
          {canGenerateAndApply && (
            <button
              onClick={() => onGenerateAndApply(plan.id)}
              disabled={!isActionable}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 text-white border border-violet-500 hover:bg-violet-500 transition-colors disabled:opacity-40"
            >
              <Zap className="h-3.5 w-3.5" />
              Generate + Apply
            </button>
          )}
          {canGenerate && (
            <button
              onClick={() => onGenerate(plan.id)}
              disabled={!isActionable}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors disabled:opacity-40"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Generate
            </button>
          )}
          {canRegenerate && (
            <button
              onClick={handleRegenerate}
              disabled={!isActionable}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Regenerate
            </button>
          )}
          {canApply && (
            <button
              onClick={() => onApply(plan.id)}
              disabled={!isActionable}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
            >
              <Zap className="h-3.5 w-3.5" />
              Apply to Site
            </button>
          )}
          {canReject && (
            <button
              onClick={() => onReject(plan.id)}
              disabled={!isActionable}
              className="ml-auto flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-medium text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </button>
          )}
        </div>
      )}

      {plan.status === 'applied' && (
        <div className="px-4 pb-3 flex items-center gap-2 text-xs text-emerald-400/70">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Applied to website
        </div>
      )}
    </div>
  )
}
