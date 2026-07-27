'use client'

import { useMemo, useState } from 'react'
import { Columns2, ScanSearch, SlidersHorizontal } from 'lucide-react'
import { SignedDamageImage } from './SignedDamageImage'
import { comparisonConfidenceLabel } from '@/lib/van-damage/comparison'

export interface BeforeAfterPair {
  canonicalView: string
  currentImageId: string
  priorImageId: string
  comparability: string
}

export function BeforeAfterComparison({
  businessId,
  currentDate,
  priorDate,
  confidence,
  pairs,
}: {
  businessId: string
  currentDate: string
  priorDate: string
  confidence: number | null
  pairs: BeforeAfterPair[]
}) {
  const [view, setView] = useState(pairs[0]?.canonicalView ?? '')
  const [mode, setMode] = useState<'side_by_side' | 'swipe'>('side_by_side')
  const [reveal, setReveal] = useState(50)
  const pair = useMemo(
    () => pairs.find((item) => item.canonicalView === view) ?? pairs[0],
    [pairs, view]
  )
  if (!pair) return null
  const warning = pair.comparability === 'low_confidence'

  return (
    <section
      id="before-after-comparison"
      className="overflow-hidden rounded-2xl border border-white/10 bg-graphite-800"
    >
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5 text-brand" />
            <h2 className="font-semibold text-white">Before &amp; After</h2>
          </div>
          <p className="mt-1 text-xs text-white/40">
            Most recent valid comparable evidence · {comparisonConfidenceLabel(confidence)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={view}
            onChange={(event) => setView(event.target.value)}
            className="focus-ring min-h-10 rounded-xl border border-white/10 bg-black/15 px-3 text-xs capitalize text-white"
          >
            {pairs.map((item) => (
              <option key={item.canonicalView} value={item.canonicalView}>
                {item.canonicalView.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setMode('side_by_side')}
            className={`focus-ring min-h-10 rounded-xl border px-3 text-xs ${mode === 'side_by_side' ? 'border-brand/30 bg-brand/10 text-brand' : 'border-white/10 text-white/55'}`}
          >
            <Columns2 className="mr-1.5 inline h-3.5 w-3.5" /> Side by side
          </button>
          <button
            type="button"
            onClick={() => setMode('swipe')}
            className={`focus-ring min-h-10 rounded-xl border px-3 text-xs ${mode === 'swipe' ? 'border-brand/30 bg-brand/10 text-brand' : 'border-white/10 text-white/55'}`}
          >
            <SlidersHorizontal className="mr-1.5 inline h-3.5 w-3.5" /> Swipe
          </button>
        </div>
      </div>
      {warning && (
        <p className="border-b border-amber-300/15 bg-amber-300/[.06] px-5 py-3 text-xs text-amber-100/80">
          The camera angle or image quality limits this comparison. No new-damage claim should be
          confirmed from this pair alone.
        </p>
      )}
      <div className="p-5">
        {mode === 'side_by_side' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Evidence
              label="Prior"
              date={priorDate}
              imageId={pair.priorImageId}
              businessId={businessId}
            />
            <Evidence
              label="Current"
              date={currentDate}
              imageId={pair.currentImageId}
              businessId={businessId}
            />
          </div>
        ) : (
          <div>
            <div className="relative mx-auto aspect-[4/3] max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-black/20">
              <SignedDamageImage
                imageId={pair.priorImageId}
                businessId={businessId}
                alt="Prior comparable inspection evidence"
                fillContainer
                sizes="(max-width: 768px) 100vw, 900px"
              />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}
              >
                <SignedDamageImage
                  imageId={pair.currentImageId}
                  businessId={businessId}
                  alt="Current inspection evidence"
                  fillContainer
                  sizes="(max-width: 768px) 100vw, 900px"
                />
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,.3)]"
                style={{ left: `${reveal}%` }}
              />
            </div>
            <label className="mx-auto mt-4 flex max-w-xl items-center gap-3 text-xs text-white/45">
              Prior
              <input
                aria-label="Comparison reveal"
                type="range"
                min="0"
                max="100"
                value={reveal}
                onChange={(event) => setReveal(Number(event.target.value))}
                className="w-full accent-[var(--tenant-accent)]"
              />
              Current
            </label>
          </div>
        )}
      </div>
      <p className="border-t border-white/8 px-5 py-3 text-xs text-white/35">
        Automated comparisons are advisory. A reviewer must confirm new damage, severity changes,
        and repair outcomes.
      </p>
    </section>
  )
}

function Evidence({
  label,
  date,
  imageId,
  businessId,
}: {
  label: string
  date: string
  imageId: string
  businessId: string
}) {
  return (
    <figure>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <SignedDamageImage
          imageId={imageId}
          businessId={businessId}
          alt={`${label} inspection evidence`}
          fillContainer
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-white/45">
        <span>{label}</span>
        <time>{date}</time>
      </figcaption>
    </figure>
  )
}
