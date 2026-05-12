'use client'
// components/website/premium/PremiumDesignBadge.tsx
// Small status badge shown on builder section cards.

import { cn } from '@/lib/utils'

export type BadgeVariant = 'ai_enhanced' | 'animated' | 'premium_ui' | 'disabled'

const BADGE_CONFIG: Record<BadgeVariant, { label: string; classes: string; dot: string }> = {
  ai_enhanced: {
    label:   'AI Enhanced',
    classes: 'bg-violet-500/15 border-violet-500/30 text-violet-300',
    dot:     'bg-violet-400',
  },
  animated: {
    label:   'Animated',
    classes: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    dot:     'bg-amber-400',
  },
  premium_ui: {
    label:   'Premium UI',
    classes: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    dot:     'bg-emerald-400',
  },
  disabled: {
    label:   'Disabled',
    classes: 'bg-white/5 border-white/10 text-white/30',
    dot:     'bg-white/20',
  },
}

interface Props {
  variant:    BadgeVariant
  className?: string
}

export function PremiumDesignBadge({ variant, className }: Props) {
  const { label, classes, dot } = BADGE_CONFIG[variant]
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-2xs font-semibold uppercase tracking-wide leading-none',
      classes,
      className,
    )}>
      <span className={cn('w-1 h-1 rounded-full', dot)} />
      {label}
    </span>
  )
}

/**
 * Derives which badges to show from a raw animation_config object.
 */
export function getAnimationBadges(
  animationConfig: Record<string, unknown> | null | undefined,
): BadgeVariant[] {
  if (!animationConfig || Object.keys(animationConfig).length === 0) return []

  const cfg = animationConfig as Record<string, unknown>
  if (cfg.enabled === false) return ['disabled']

  const badges: BadgeVariant[] = []
  const anim  = cfg.animation as Record<string, unknown> | undefined
  const style = cfg.style    as Record<string, unknown> | undefined

  if (cfg.sourcePlanId) badges.push('ai_enhanced')
  if (anim?.preset && anim.preset !== 'none') badges.push('animated')
  if (style?.stylePreset && style.stylePreset !== 'none') badges.push('premium_ui')

  return badges
}
