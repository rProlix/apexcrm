'use client'
// components/website/canva/CanvaPdfPageVisualSection.tsx
// Visual-first section: displays a rendered Canva PDF page image with working
// hotspot overlays and fallback action buttons.

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { PageVisualAnimationPreset } from '@/lib/website/canva/pdf/canva-pdf-animation-mapper'

export interface PageVisualOverlay {
  id: string
  label: string
  actionType: string
  href?: string
  xPercent?: number
  yPercent?: number
  widthPercent?: number
  heightPercent?: number
  style: 'invisible_hotspot' | 'visible_button'
}

export interface PageVisualFallback {
  label: string
  actionType: string
  href?: string
}

export interface CanvaPdfPageVisualConfig {
  type: 'canva_pdf_page_visual'
  sectionType?: 'canva_pdf_page_visual'
  pageNumber: number
  renderedImageUrl: string
  thumbnailUrl?: string
  aspectRatio: number
  originalWidth?: number
  originalHeight?: number
  animationPreset?: PageVisualAnimationPreset
  visualAnimation?: { preset: string; delay?: number; duration?: number }
  overlays?: PageVisualOverlay[]
  fallbackActions?: PageVisualFallback[]
  mobileBehavior?: 'scale' | 'stack_actions_below'
}

function pageVariants(preset: PageVisualAnimationPreset, duration: number, delay: number) {
  const t = { duration, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
  switch (preset) {
    case 'premiumBlurReveal':
      return { hidden: { opacity: 0, filter: 'blur(14px)', scale: 1.02 }, show: { opacity: 1, filter: 'blur(0px)', scale: 1, transition: t } }
    case 'softZoomIn':
      return { hidden: { opacity: 0, scale: 1.04 }, show: { opacity: 1, scale: 1, transition: t } }
    case 'characterPopIn':
      return { hidden: { opacity: 0, scale: 0.92, y: 24 }, show: { opacity: 1, scale: 1, y: 0, transition: t } }
    case 'fadeUp':
      return { hidden: { opacity: 0, y: 32 }, show: { opacity: 1, y: 0, transition: t } }
    case 'fadeIn':
    default:
      return { hidden: { opacity: 0 }, show: { opacity: 1, transition: t } }
  }
}

function ActionLink({ href, label, style }: { href: string; label: string; style?: React.CSSProperties }) {
  const isExternal = /^https?:\/\//i.test(href)
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '0.65rem 1.25rem', borderRadius: 999, fontSize: '0.875rem', fontWeight: 600,
    textDecoration: 'none', color: '#fff',
    background: 'linear-gradient(135deg,var(--color-primary,#7c3aed),var(--color-accent,#db2777))',
    border: 'none', cursor: 'pointer', ...style,
  }
  if (href.startsWith('/') && !isExternal) {
    return <Link href={href} style={base} aria-label={label}>{label}</Link>
  }
  return (
    <a href={href} style={base} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined}>
      {label}
    </a>
  )
}

export function CanvaPdfPageVisualSection({ config }: { config: CanvaPdfPageVisualConfig }) {
  const preset = (config.visualAnimation?.preset ?? config.animationPreset ?? 'softZoomIn') as PageVisualAnimationPreset
  const duration = config.visualAnimation?.duration ?? 0.85
  const delay = config.visualAnimation?.delay ?? 0
  const aspect = config.aspectRatio > 0 ? config.aspectRatio : 1.414
  const overlays = config.overlays ?? []
  const fallbacks = config.fallbackActions ?? []
  const stackBelow = config.mobileBehavior !== 'scale'

  return (
    <section
      style={{
        width: '100%',
        background: 'linear-gradient(180deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%)',
        padding: '0.5rem 0 1rem',
      }}
    >
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.12 }}
        variants={pageVariants(preset, duration, delay)}
        style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '0 0.5rem' }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            paddingBottom: `${aspect * 100}%`,
            background: '#fff',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={config.renderedImageUrl}
            alt={`Canva design page ${config.pageNumber}`}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'top center',
            }}
          />
          {overlays.map((o) => {
            if (!o.href || o.style !== 'invisible_hotspot') return null
            return (
              <div
                key={o.id}
                style={{
                  position: 'absolute',
                  left: `${o.xPercent ?? 0}%`,
                  top: `${o.yPercent ?? 0}%`,
                  width: `${o.widthPercent ?? 12}%`,
                  height: `${o.heightPercent ?? 6}%`,
                  zIndex: 5,
                }}
              >
                <ActionLink
                  href={o.href}
                  label={o.label}
                  style={{
                    width: '100%',
                    height: '100%',
                    padding: 0,
                    background: 'transparent',
                    opacity: 0,
                    minHeight: 44,
                  }}
                />
              </div>
            )
          })}
        </div>
      </motion.div>

      {(fallbacks.length > 0 || overlays.some((o) => o.style === 'visible_button')) && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.5 }}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.65rem',
            justifyContent: 'center',
            padding: stackBelow ? '1rem 1rem 1.5rem' : '0.75rem',
            maxWidth: 960,
            margin: '0 auto',
          }}
        >
          {overlays.filter((o) => o.style === 'visible_button' && o.href).map((o) => (
            <ActionLink key={o.id} href={o.href!} label={o.label} />
          ))}
          {fallbacks.filter((f) => f.href).map((f, i) => (
            <ActionLink key={`fb-${i}`} href={f.href!} label={f.label} />
          ))}
        </motion.div>
      )}
    </section>
  )
}
