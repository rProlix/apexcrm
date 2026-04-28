'use client'
// components/spin-packages/SpinImageGrid.tsx
// Shows a preview grid of all generated frames for a spin package.

import type { SpinImage } from '@/types/spin-packages'
import Image from 'next/image'

interface Props {
  images:    SpinImage[]
  imageCount: number
}

export default function SpinImageGrid({ images, imageCount }: Props) {
  const sorted = [...images].sort((a, b) => a.frame_index - b.frame_index)

  // Placeholder slots for pending frames
  const slots = Array.from({ length: imageCount }, (_, i) => {
    return sorted.find(img => img.frame_index === i) ?? null
  })

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${Math.min(imageCount, 12)}, minmax(0, 1fr))` }}
    >
      {slots.map((img, i) =>
        img ? (
          <div
            key={img.id}
            className="aspect-square rounded overflow-hidden bg-zinc-800 relative group"
          >
            <Image
              src={img.image_url}
              alt={`Frame ${i}`}
              fill
              sizes="80px"
              className="object-cover group-hover:scale-110 transition-transform duration-200"
            />
            <span className="absolute bottom-0 left-0 right-0 text-center text-[8px] bg-black/60 text-white/60 py-0.5">
              {i}
            </span>
          </div>
        ) : (
          <div
            key={`empty-${i}`}
            className="aspect-square rounded bg-zinc-800/50 border border-dashed border-zinc-700 flex items-center justify-center"
          >
            <span className="text-[8px] text-zinc-600">{i}</span>
          </div>
        )
      )}
    </div>
  )
}
