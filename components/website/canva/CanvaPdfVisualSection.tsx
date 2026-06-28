'use client'
// components/website/canva/CanvaPdfVisualSection.tsx
// Preserves actual Canva PDF design visuals via rendered page images, with
// native clickable overlays and animated visual layers.

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { VisualAnimationPreset } from '@/lib/website/canva/visual-animation-mapper'
import type { MappedLink } from '@/lib/website/canva/link-mapper'

export interface VisualLayerConfig {
  id: string
  type: 'background' | 'image' | 'graphic' | 'character' | 'decorative'
  url: string
  x?: number
  y?: number
  width?: number
  height?: number
  animation?: { preset: VisualAnimationPreset; delay?: number; duration?: number; trigger?: 'onView' | 'onScroll' }
}

export interface OverlayConfig {
  id: string
  label: string
  actionType: string
  href?: string
  x?: number
  y?: number
  width?: number
  height?: number
  style?: 'invisible_hotspot' | 'native_button' | 'outline' | 'filled'
}

export interface CanvaPdfVisualSectionConfig {
  type: 'canva_pdf_visual_section'
  pageNumber: number
  renderedImageUrl: string
  thumbnailUrl?: string
  aspectRatio?: number
  visualLayers?: VisualLayerConfig[]
  overlays?: OverlayConfig[]
  animationPreset?: VisualAnimationPreset
  mobileBehavior?: 'scale' | 'stack' | 'crop_safe' | 'rebuild'
  linkMapping?: MappedLink[]
}

function visualVariants(preset: VisualAnimationPreset, duration: number, delay: number) {
  const t = { duration, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
  switch (preset) {
    case 'characterPopIn': return { hidden: { opacity: 0, scale: 0.85, y: 20 }, show: { opacity: 1, scale: 1, y: 0, transition: t } }
    case 'characterFloatIn': return { hidden: { opacity: 0, y: 40 }, show: { opacity: 1, y: 0, transition: { ...t, duration: duration * 1.2 } } }
    case 'graphicFadeUp': return { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: t } }
    case 'graphicSlideInLeft': return { hidden: { opacity: 0, x: -40 }, show: { opacity: 1, x: 0, transition: t } }
    case 'graphicSlideInRight': return { hidden: { opacity: 0, x: 40 }, show: { opacity: 1, x: 0, transition: t } }
    case 'decorativeFloat': return { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: t } }
    case 'softZoomIn': return { hidden: { opacity: 0, scale: 1.04 }, show: { opacity: 1, scale: 1, transition: t } }
    case 'sparkleIn': return { hidden: { opacity: 0, scale: 0.96, filter: 'blur(6px)' }, show: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: t } }
    case 'premiumBlurReveal': return { hidden: { opacity: 0, filter: 'blur(12px)' }, show: { opacity: 1, filter: 'blur(0px)', transition: t } }
    case 'imageReveal': return { hidden: { opacity: 0, clipPath: 'inset(8% 8% 8% 8%)' }, show: { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)', transition: t } }
    case 'fadeUp': return { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: t } }
    case 'fadeIn':
    default: return { hidden: { opacity: 0 }, show: { opacity: 1, transition: t } }
  }
}

function OverlayButton({ overlay }: { overlay: OverlayConfig }) {
  const href = overlay.href || '#'
  const isExternal = /^https?:\/\//i.test(href)
  const style = overlay.style ?? 'native_button'
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: style === 'invisible_hotspot' ? 0 : '0.65rem 1.25rem',
    borderRadius: style === 'outline' ? 999 : 12,
    fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none',
    border: style === 'outline' ? '2px solid rgba(255,255,255,0.85)' : 'none',
    background: style === 'filled' || style === 'native_button'
      ? 'linear-gradient(135deg,var(--color-primary,#7c3aed),var(--color-accent,#db2777))'
      : 'transparent',
    color: style === 'invisible_hotspot' ? 'transparent' : '#fff',
    minWidth: style === 'invisible_hotspot' ? 44 : undefined,
    minHeight: style === 'invisible_hotspot' ? 44 : undefined,
    cursor: 'pointer',
  }
  if (href.startsWith('/') && !isExternal) {
    return <Link href={href} style={base} aria-label={overlay.label}>{overlay.label !== overlay.id ? overlay.label : 'Open'}</Link>
  }
  return (
    <a href={href} style={base} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined}>
      {overlay.label}
    </a>
  )
}

export function CanvaPdfVisualSection({ config }: { config: CanvaPdfVisualSectionConfig }) {
  const aspect = config.aspectRatio && config.aspectRatio > 0 ? config.aspectRatio : 0.707
  const pageAnim = config.animationPreset ?? 'softZoomIn'
  const overlays = config.overlays ?? []
  const positioned = overlays.filter((o) => typeof o.x === 'number' && typeof o.y === 'number')
  const fallbackButtons = overlays.filter((o) => typeof o.x !== 'number' || typeof o.y !== 'number')
  const extraLinks = (config.linkMapping ?? []).filter((l) => !l.dead && !overlays.some((o) => o.href === l.href))

  return (
    <section style={{ position: 'relative', width: '100%', background: '#000' }}>
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        variants={visualVariants(pageAnim, 0.9, 0)}
        style={{ position: 'relative', width: '100%', maxWidth: 1200, margin: '0 auto' }}
      >
        <div style={{ position: 'relative', width: '100%', paddingBottom: `${aspect * 100}%`, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={config.renderedImageUrl}
            alt={`Canva design page ${config.pageNumber}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top center' }}
          />
          {(config.visualLayers ?? []).map((layer, i) => (
            <motion.img
              key={layer.id}
              src={layer.url}
              alt=""
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.2 }}
              variants={visualVariants(layer.animation?.preset ?? 'graphicFadeUp', layer.animation?.duration ?? 0.75, layer.animation?.delay ?? i * 0.08)}
              style={{
                position: 'absolute',
                left: layer.x != null ? `${(layer.x / 1000) * 100}%` : undefined,
                top: layer.y != null ? `${(layer.y / 1000) * 100}%` : undefined,
                width: layer.width ? `${(layer.width / 1000) * 100}%` : '20%',
                height: 'auto',
                pointerEvents: 'none',
              }}
            />
          ))}
          {positioned.map((overlay) => (
            <div
              key={overlay.id}
              style={{
                position: 'absolute',
                left: `${((overlay.x ?? 0) / 1000) * 100}%`,
                top: `${((overlay.y ?? 0) / 1000) * 100}%`,
                width: overlay.width ? `${(overlay.width / 1000) * 100}%` : 'auto',
                zIndex: 5,
              }}
            >
              <OverlayButton overlay={overlay} />
            </div>
          ))}
        </div>
      </motion.div>

      {(fallbackButtons.length > 0 || extraLinks.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center', padding: '1.25rem 1rem 2rem' }}>
          {fallbackButtons.map((o) => <OverlayButton key={o.id} overlay={o} />)}
          {extraLinks.slice(0, 6).map((l) => (
            <OverlayButton key={l.id} overlay={{ id: l.id, label: l.label, href: l.href, actionType: l.actionType, style: 'filled' }} />
          ))}
        </div>
      )}
    </section>
  )
}
