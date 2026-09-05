// components/site/PremiumSectionFrame.tsx
// Wraps a website section with premium visual treatment:
//   - Background (solid, gradient, layered, glass, editorial)
//   - Image overlay (gradient scrim, blur, solid)
//   - Top/bottom SVG dividers
//   - Responsive section padding
//   - Box shadow and border radius
//
// Server Component — no useState/useEffect.

import type { SectionDesign } from '@/lib/website/design/types'
import { SectionDivider } from './SectionDivider'

interface Props {
  /** Raw section row (contains style_config) */
  sectionDesign?: Partial<SectionDesign> | null
  children: React.ReactNode
  className?: string
  sectionType?: string
}

// ── Spacing map ────────────────────────────────────────────────────────────────

const PADDING_MAP: Record<string, string> = {
  compact: 'clamp(2.5rem, 5vw, 3rem) clamp(1rem, 3vw, 1.25rem)',
  balanced: 'clamp(3.5rem, 7vw, 5rem) clamp(1rem, 4vw, 1.5rem)',
  airy: 'clamp(4rem, 8vw, 6.5rem) clamp(1rem, 4vw, 1.5rem)',
  luxury: 'clamp(4.5rem, 9vw, 7rem) clamp(1rem, 4vw, 1.5rem)',
}

// ── Card style → CSS ──────────────────────────────────────────────────────────

function cardStyleToCss(style: string | undefined): React.CSSProperties {
  switch (style) {
    case 'glass':
      return {
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 'var(--radius-card, 1rem)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }
    case 'floating':
      return {
        background: 'var(--ds-surface, var(--color-surface))',
        borderRadius: 'var(--radius-card, 1rem)',
        boxShadow: 'var(--shadow-floating, 0 8px 40px rgba(0,0,0,0.12))',
      }
    case 'bordered':
      return {
        background: 'var(--ds-surface, var(--color-surface))',
        border: '1px solid var(--ds-border, var(--color-border))',
        borderRadius: 'var(--radius-card, 1rem)',
      }
    case 'editorial':
      return {
        background: 'transparent',
        borderBottom: '2px solid var(--ds-border, var(--color-border))',
        borderRadius: '0',
      }
    case 'soft':
    default:
      return {
        background: 'var(--ds-surface, var(--color-surface))',
        borderRadius: 'var(--radius-card, 1rem)',
        boxShadow: 'var(--shadow-card, 0 2px 14px rgba(0,0,0,0.07))',
      }
  }
}

// ── Background builder ────────────────────────────────────────────────────────

function buildBackground(design: Partial<SectionDesign> | null | undefined): string {
  if (!design?.backgroundType || design.backgroundType === 'solid') {
    return design?.backgroundValue || 'var(--ds-bg, var(--color-bg))'
  }

  if (design.backgroundType === 'gradient') {
    return design.backgroundValue || 'var(--gradient-section-soft)'
  }

  if (design.backgroundType === 'layered') {
    const base = design.backgroundValue || 'var(--ds-surface)'
    return base
  }

  if (design.backgroundType === 'glass') {
    return 'rgba(255,255,255,0.06)'
  }

  return design.backgroundValue || 'var(--ds-bg, var(--color-bg))'
}

// ── Main component ────────────────────────────────────────────────────────────

export function PremiumSectionFrame({ sectionDesign, children, className, sectionType }: Props) {
  const d = sectionDesign

  // Background
  const bg = buildBackground(d)

  // Padding
  const spacing = d?.spacing ?? 'balanced'
  const padding = PADDING_MAP[spacing] ?? '5rem 1.5rem'

  // Overlay
  const hasOverlay = d?.overlay?.enabled && d.overlay.opacity > 0
  const overlayValue = d?.overlay?.value
  const overlayOpacity = d?.overlay?.opacity ?? 0

  // Dividers
  const divTop = d?.dividerTop
  const divBottom = d?.dividerBottom
  const bgColorForDivider = extractSolidColor(bg)

  // Scroll experiences must keep overflow visible for their sticky runway.
  const isScrollExperience = sectionType === 'scroll_experience'

  // Section shadow
  const hasShadow = d?.shadow && d.shadow !== 'none'
  const sectionShadow = hasShadow
    ? d?.shadow === 'premium'
      ? 'var(--shadow-floating)'
      : d?.shadow === 'medium'
        ? '0 4px 20px rgba(0,0,0,0.10)'
        : 'var(--shadow-card)'
    : undefined

  // Border radius for entire section (usually 0 unless editorial)
  const sectionRadius =
    d?.borderRadius === 'large'
      ? '1.5rem'
      : d?.borderRadius === 'organic'
        ? '2rem'
        : d?.borderRadius === 'soft'
          ? '0.5rem'
          : undefined

  const wrapperStyle = {
    position: 'relative',
    background: bg,
    // A scroll experience contains a sticky viewport inside a taller scroll
    // runway. Clipping this ancestor disables sticky positioning in browsers.
    overflow: isScrollExperience ? 'visible' : 'hidden',
    // Inner section components own their layout padding. Supplying the value as
    // a variable avoids the previous frame + section double-padding.
    '--section-padding-desk': padding,
    '--ds-text': d?.textColor || undefined,
    '--ds-muted': d?.subtextColor || undefined,
    boxShadow: sectionShadow,
    borderRadius: sectionRadius,
  } as React.CSSProperties

  // Glass section extra
  if (d?.backgroundType === 'glass') {
    wrapperStyle.backdropFilter = 'blur(16px)'
    wrapperStyle.WebkitBackdropFilter = 'blur(16px)'
    wrapperStyle.border = '1px solid rgba(255,255,255,0.12)'
  }

  return (
    <div
      className={className}
      style={wrapperStyle}
      data-section-type={sectionType}
      data-design-spacing={spacing}
    >
      {/* Overlay (gradient/scrim) */}
      {hasOverlay && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            background:
              d?.overlay?.type === 'scrim'
                ? `rgba(0,0,0,${overlayOpacity})`
                : overlayValue || `rgba(0,0,0,${overlayOpacity * 0.7})`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Top divider (belongs to THIS section, sits above previous) */}
      {divTop && divTop !== 'none' && (
        <SectionDivider style={divTop} position="top" fillColor={bgColorForDivider} />
      )}

      {/* Section content */}
      <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>

      {/* Bottom divider (bleeds into next section) */}
      {divBottom && divBottom !== 'none' && (
        <SectionDivider style={divBottom} position="bottom" fillColor={bgColorForDivider} />
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractSolidColor(bg: string): string {
  // If the background is a solid hex, return it
  if (/^#[0-9A-Fa-f]{3,8}$/.test(bg)) return bg
  // If it's a CSS var reference
  if (bg.startsWith('var(')) return 'var(--ds-bg, #ffffff)'
  return '#ffffff'
}

// ── Card style helper for inner section use ───────────────────────────────────

/** Returns inline style props for cards within a section */
export function getCardStyleProps(
  design: Partial<SectionDesign> | null | undefined
): React.CSSProperties {
  return cardStyleToCss(design?.cardStyle)
}

/** Returns text color from section design (falls back to CSS var) */
export function getSectionTextColor(design: Partial<SectionDesign> | null | undefined): string {
  return design?.textColor || 'var(--ds-text, var(--color-text))'
}

/** Returns subtext color from section design */
export function getSectionSubtextColor(design: Partial<SectionDesign> | null | undefined): string {
  return design?.subtextColor || 'var(--ds-muted, var(--color-muted))'
}
