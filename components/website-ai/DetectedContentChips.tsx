'use client'
// components/website-ai/DetectedContentChips.tsx

import { cn } from '@/lib/utils'

const TYPE_STYLES: Record<string, string> = {
  reviews:      'bg-violet-500/12 text-violet-400 border-violet-500/20',
  testimonials: 'bg-violet-500/12 text-violet-400 border-violet-500/20',
  services:     'bg-blue-500/12 text-blue-400 border-blue-500/20',
  products:     'bg-emerald-500/12 text-emerald-400 border-emerald-500/20',
  menu:         'bg-emerald-500/12 text-emerald-400 border-emerald-500/20',
  hours:        'bg-gold-500/12 text-gold-400 border-gold-500/20',
  contact:      'bg-pink-500/12 text-pink-400 border-pink-500/20',
  about:        'bg-indigo-500/12 text-indigo-400 border-indigo-500/20',
  hero:         'bg-indigo-500/12 text-indigo-400 border-indigo-500/20',
  faq:          'bg-orange-500/12 text-orange-400 border-orange-500/20',
  policies:     'bg-red-500/12 text-red-400 border-red-500/20',
  social_links: 'bg-sky-500/12 text-sky-400 border-sky-500/20',
  promotions:   'bg-rose-500/12 text-rose-400 border-rose-500/20',
  seo:          'bg-teal-500/12 text-teal-400 border-teal-500/20',
}

interface Props {
  types: string[]
}

export function DetectedContentChips({ types }: Props) {
  if (!types.length) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((type) => (
        <span
          key={type}
          className={cn(
            'text-2xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border',
            TYPE_STYLES[type] ?? 'bg-white/8 text-white/40 border-white/10',
          )}
        >
          {type.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  )
}
