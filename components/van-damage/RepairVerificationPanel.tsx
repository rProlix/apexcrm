'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ImageOff, RotateCcw, ShieldCheck, Wrench } from 'lucide-react'
import { SignedDamageImage } from './SignedDamageImage'
import { comparisonConfidenceLabel } from '@/lib/van-damage/comparison'

type Verification = {
  id: string
  status: string
  aiClassification: string | null
  aiConfidence: number | null
  aiExplanation: string | null
  humanDecision: string | null
  humanReviewNote: string | null
  originalImageId: string | null
  postRepairImageId: string | null
}

export function RepairVerificationPanel({
  businessId,
  verification,
  canReview,
}: {
  businessId: string
  verification: Verification
  canReview: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const decide = (decision: string) => {
    setError('')
    startTransition(async () => {
      const response = await fetch(
        `/api/van-damage/repair-verifications/${verification.id}/decision`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision, reviewNote: note }),
        }
      )
      const body = (await response.json()) as { error?: string }
      if (!response.ok) return setError(body.error || 'Unable to save review.')
      router.refresh()
    })
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-graphite-800">
      <div className="border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-brand" />
          <h2 className="font-semibold text-white">Repair Verification</h2>
        </div>
        <p className="mt-1 text-xs text-white/40">
          Private evidence · AI assessment is advisory · Human confirmation is required
        </p>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <Evidence
          title="Original damage"
          imageId={verification.originalImageId}
          businessId={businessId}
        />
        <Evidence
          title="Post-repair evidence"
          imageId={verification.postRepairImageId}
          businessId={businessId}
        />
      </div>
      <div className="border-t border-white/8 p-5">
        <p className="text-[10px] uppercase tracking-[.14em] text-white/35">AI assessment</p>
        <p className="mt-2 font-medium capitalize text-white">
          {verification.aiClassification?.replaceAll('_', ' ') || 'Assessment pending'}
        </p>
        <p className="mt-1 text-xs text-white/45">
          {comparisonConfidenceLabel(verification.aiConfidence)}
        </p>
        <p className="mt-3 text-sm leading-6 text-white/60">
          {verification.aiExplanation ||
            'The evidence remains available for manual review while automated comparison is pending.'}
        </p>
        <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[.06] px-3 py-2 text-xs text-amber-100/80">
          AI assessment only. This repair is not verified until an authorized person confirms the
          evidence.
        </p>
      </div>
      {verification.humanDecision && (
        <div className="border-t border-emerald-300/15 bg-emerald-300/[.045] px-5 py-4 text-sm text-emerald-100">
          <ShieldCheck className="mr-2 inline h-4 w-4" />
          Human decision: {verification.humanDecision.replaceAll('_', ' ')}
          {verification.humanReviewNote && (
            <p className="mt-2 text-xs text-emerald-100/65">{verification.humanReviewNote}</p>
          )}
        </div>
      )}
      {canReview &&
        [
          'ai_review_complete',
          'human_review_required',
          'insufficient_images',
          'partially_repaired',
          'damage_still_visible',
        ].includes(verification.status) && (
          <div className="border-t border-white/8 p-5">
            <label className="block text-xs text-white/45">
              Review note
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="focus-ring mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-black/15 p-3 text-sm text-white"
                placeholder="Add evidence-based context, especially when requesting new images."
              />
            </label>
            {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Action
                icon={CheckCircle2}
                disabled={pending}
                onClick={() => decide('confirm_repaired')}
              >
                Confirm repaired
              </Action>
              <Action
                icon={ShieldCheck}
                disabled={pending}
                onClick={() => decide('confirm_partially_repaired')}
              >
                Partially repaired
              </Action>
              <Action
                icon={RotateCcw}
                disabled={pending}
                onClick={() => decide('confirm_damage_still_present')}
              >
                Damage still present
              </Action>
              <Action
                icon={ImageOff}
                disabled={pending}
                onClick={() => decide('request_more_images')}
              >
                Request more images
              </Action>
            </div>
          </div>
        )}
    </section>
  )
}

function Evidence({
  title,
  imageId,
  businessId,
}: {
  title: string
  imageId: string | null
  businessId: string
}) {
  return (
    <figure>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        {imageId ? (
          <SignedDamageImage
            imageId={imageId}
            businessId={businessId}
            alt={title}
            fillContainer
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-white/30">
            Evidence image not yet available
          </div>
        )}
      </div>
      <figcaption className="mt-2 text-xs text-white/45">{title}</figcaption>
    </figure>
  )
}
function Action({
  icon: Icon,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: typeof CheckCircle2 }) {
  return (
    <button
      type="button"
      {...props}
      className="focus-ring min-h-10 rounded-xl border border-white/10 px-3 text-xs font-medium text-white transition-transform active:scale-[.97] hover:bg-white/5 disabled:opacity-40"
    >
      <Icon className="mr-1.5 inline h-3.5 w-3.5" />
      {children}
    </button>
  )
}
