'use client'
// components/website/canva/CanvaConvertedEventView.tsx
// Public renderer for a Canva PDF that was AI-converted into native NexoraNow
// Invitation/Event website sections. Renders editable section types with
// recreated NexoraNow animations — NO Canva iframe. POV CTAs stay native.

import type { CSSProperties } from 'react'
import { AnimatedReveal } from './AnimatedReveal'
import type { NexoraAnimationPreset } from '@/lib/website/canva/pdf-animation-recreator'

interface SectionAnim { preset: NexoraAnimationPreset; delay?: number; duration?: number; stagger?: number; hover?: boolean }
interface Section { section_type: string; section_key?: string; content?: Record<string, unknown>; animation?: SectionAnim }

interface Props {
  title: string
  sections: Section[]
  theme?: Record<string, unknown>
  isDraftPreview?: boolean
}

function themeVars(theme?: Record<string, unknown>): CSSProperties {
  const colors = (theme?.colors as Record<string, string>) ?? {}
  const fonts = (theme?.fonts as Record<string, string>) ?? {}
  return {
    '--color-bg': colors.background ?? '#0b0b0b',
    '--color-text': colors.text ?? '#ffffff',
    '--color-primary': colors.primary ?? '#7c3aed',
    '--color-accent': colors.accent ?? '#db2777',
    '--font-heading': fonts.heading ?? 'inherit',
    '--font-body': fonts.body ?? 'inherit',
  } as CSSProperties
}

const wrap: CSSProperties = { maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }
const cta: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.75rem 1.5rem', borderRadius: 999,
  fontSize: '0.95rem', fontWeight: 600, color: '#fff',
  background: 'linear-gradient(135deg,var(--color-primary,#7c3aed),var(--color-accent,#db2777))', textDecoration: 'none',
}

function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v : fallback }

function SectionView({ section }: { section: Section }) {
  const c = section.content ?? {}
  const anim = section.animation ?? { preset: 'fadeUp' as NexoraAnimationPreset }
  const reveal = (node: React.ReactNode) => (
    <AnimatedReveal preset={anim.preset} delay={anim.delay} duration={anim.duration}>{node}</AnimatedReveal>
  )

  switch (section.section_type) {
    case 'hero': {
      const bg = str(c.backgroundImage)
      return (
        <section style={{ position: 'relative', minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', background: bg ? `url(${bg}) center/cover no-repeat` : 'var(--color-bg)' }}>
          {bg && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />}
          <div style={{ ...wrap, position: 'relative', zIndex: 2 }}>
            {reveal(<>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem,6vw,4rem)', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>{str(c.headline, 'Our Event')}</h1>
              {str(c.subheadline) && <p style={{ color: 'var(--color-text)', opacity: 0.85, fontSize: 'clamp(1rem,2.4vw,1.4rem)', marginTop: '1rem' }}>{str(c.subheadline)}</p>}
              {str(c.ctaLabel) && <div style={{ marginTop: '1.75rem' }}><a href={str(c.ctaHref, '#')} style={cta}>{str(c.ctaLabel)}</a></div>}
            </>)}
          </div>
        </section>
      )
    }
    case 'about':
      return (
        <section style={{ padding: '4rem 0', background: 'var(--color-bg)' }}>
          <div style={wrap}>{reveal(<>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.5rem,4vw,2.5rem)', fontWeight: 700, color: 'var(--color-text)' }}>{str(c.headline)}</h2>
            <p style={{ color: 'var(--color-text)', opacity: 0.8, lineHeight: 1.7, marginTop: '1rem', fontSize: '1.05rem', whiteSpace: 'pre-wrap' }}>{str(c.body)}</p>
          </>)}</div>
        </section>
      )
    case 'feature_grid': {
      const items = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : []
      const cols = Number(c.columns) === 2 ? 2 : Number(c.columns) === 4 ? 4 : 3
      return (
        <section style={{ padding: '4rem 0', background: 'var(--color-bg)' }}>
          <div style={wrap}>
            {str(c.headline) && reveal(<h2 style={{ fontFamily: 'var(--font-heading)', textAlign: 'center', fontSize: 'clamp(1.5rem,4vw,2.5rem)', fontWeight: 700, color: 'var(--color-text)', marginBottom: '2rem' }}>{str(c.headline)}</h2>)}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${cols >= 3 ? 220 : 280}px,1fr))`, gap: '1.25rem' }}>
              {items.map((it, i) => (
                <AnimatedReveal key={i} preset={anim.preset} delay={(anim.delay ?? 0) + i * (anim.stagger ?? 0.08)} duration={anim.duration}>
                  <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '1.5rem', height: '100%' }}>
                    <h3 style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: '1.1rem' }}>{str(it.title)}</h3>
                    <p style={{ color: 'var(--color-text)', opacity: 0.7, marginTop: '0.5rem', lineHeight: 1.6 }}>{str(it.description)}</p>
                  </div>
                </AnimatedReveal>
              ))}
            </div>
          </div>
        </section>
      )
    }
    case 'image_gallery': {
      const images = Array.isArray(c.images) ? (c.images as Array<Record<string, unknown>>) : []
      return (
        <section style={{ padding: '4rem 0', background: 'var(--color-bg)' }}>
          <div style={wrap}>
            {str(c.headline) && reveal(<h2 style={{ fontFamily: 'var(--font-heading)', textAlign: 'center', fontSize: 'clamp(1.5rem,4vw,2.5rem)', fontWeight: 700, color: 'var(--color-text)', marginBottom: '2rem' }}>{str(c.headline)}</h2>)}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '0.75rem' }}>
              {images.filter((im) => str(im.url)).map((im, i) => (
                <AnimatedReveal key={i} preset={anim.preset} delay={(anim.delay ?? 0) + i * (anim.stagger ?? 0.08)} duration={anim.duration}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={str(im.url)} alt={str(im.alt, 'Event image')} style={{ width: '100%', borderRadius: 12, display: 'block' }} />
                </AnimatedReveal>
              ))}
            </div>
          </div>
        </section>
      )
    }
    case 'cta':
      return (
        <section style={{ padding: '4rem 0', background: 'var(--color-bg)', textAlign: 'center' }}>
          <div style={wrap}>{reveal(<>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.4rem,4vw,2.2rem)', fontWeight: 700, color: 'var(--color-text)' }}>{str(c.headline)}</h2>
            {str(c.body) && <p style={{ color: 'var(--color-text)', opacity: 0.8, marginTop: '0.75rem', maxWidth: 560, marginInline: 'auto' }}>{str(c.body)}</p>}
            {str(c.ctaLabel) && <div style={{ marginTop: '1.5rem' }}><a href={str(c.ctaHref, '#')} style={cta}>{str(c.ctaLabel)}</a></div>}
          </>)}</div>
        </section>
      )
    case 'rich_text':
    default:
      return (
        <section style={{ padding: '3rem 0', background: 'var(--color-bg)' }}>
          <div style={wrap}>{reveal(
            str(c.html)
              ? <div style={{ color: 'var(--color-text)', opacity: 0.85, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: str(c.html) }} />
              : <p style={{ color: 'var(--color-text)', opacity: 0.85, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{str(c.body) || str(c.headline)}</p>,
          )}</div>
        </section>
      )
  }
}

export function CanvaConvertedEventView({ title, sections, theme, isDraftPreview }: Props) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-bg,#0b0b0b)', ...themeVars(theme) }}>
      {isDraftPreview && (
        <div style={{ background: '#7c3aed', color: '#fff', textAlign: 'center', padding: '0.5rem 1rem', fontSize: '0.8125rem', fontWeight: 600 }}>
          Draft preview — this is how your event website will look once published.
        </div>
      )}
      {sections.length === 0 ? (
        <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)', opacity: 0.7 }}>
          <p>{title}</p>
        </div>
      ) : (
        sections.map((s, i) => <SectionView key={s.section_key ?? i} section={s} />)
      )}
    </main>
  )
}
