export const dynamic  = 'force-dynamic'
export const revalidate = 0

// app/events/[eventSlug]/page.tsx
// Public Invitation/Event Website entry — a unique, separate URL for an event
// site that is independent of the business website.
//
//  • A config-backed Canva event website (source='config') renders its published
//    Canva embed (or a draft preview for the owning editor).
//  • Otherwise it falls back to the native POV guest experience, the same as
//    /pov/[eventSlug] (landing/register → capture → gallery).

import { notFound } from 'next/navigation'
import { resolveEvent } from '@/lib/pov/events'
import { PovGuestClient } from '@/components/pov/PovGuestClient'
import { resolvePublicEventWebsite } from '@/lib/website/canva/eventWebsite'
import { CanvaEventPublicView } from '@/components/website/canva/CanvaEventPublicView'
import { CanvaConvertedEventView } from '@/components/website/canva/CanvaConvertedEventView'
import { getUserContext } from '@/lib/auth/getUserContext'
import { povDb } from '@/lib/pov/db'

interface Props {
  params: Promise<{ eventSlug: string }>
  searchParams: Promise<{ view?: string; preview?: string }>
}

export async function generateMetadata({ params }: Props) {
  const { eventSlug } = await params
  const site = await resolvePublicEventWebsite(eventSlug)
  if (site) return { title: `${site.name} · Event` }
  const event = await resolveEvent(eventSlug)
  return { title: event ? `${event.name} · Event` : 'Event' }
}

function pickEmbed(config: Record<string, unknown> | null): {
  embedUrl: string | null; sourceUrl: string | null; embedCode: string | null
  isCustomDomain: boolean; povEventId: string | null
} {
  if (!config) return { embedUrl: null, sourceUrl: null, embedCode: null, isCustomDomain: false, povEventId: null }
  const pages = (config.pages as Array<Record<string, unknown>> | undefined) ?? []
  const firstSection = (pages[0]?.sections as Array<Record<string, unknown>> | undefined)?.[0] ?? {}
  return {
    embedUrl: (config.iframeSrc as string) ?? (config.embedUrl as string) ?? (firstSection.embedUrl as string) ?? null,
    sourceUrl: (config.canvaSourceUrl as string) ?? (firstSection.sourceUrl as string) ?? null,
    embedCode: (config.canvaEmbedCode as string) ?? null,
    isCustomDomain: (config.canvaValidationMode as string) === 'custom_domain' || Boolean(config.isCustomDomain),
    povEventId: (config.povEventId as string) ?? null,
  }
}

export default async function EventPublicPage({ params, searchParams }: Props) {
  const { eventSlug } = await params
  const { view, preview } = await searchParams

  // 1) Config-backed Canva event website?
  let site = await resolvePublicEventWebsite(eventSlug)
  if (site) {
    const ctx = await getUserContext()
    const canPreview = !!ctx && (ctx.role === 'owner' || (['owner', 'admin'].includes(ctx.role) && ctx.tenant_id === site.tenant_id))
    const wantPreview = preview === 'draft'
    if (wantPreview && canPreview) {
      site = (await resolvePublicEventWebsite(eventSlug, { preview: true, canPreview: true })) ?? site
    }

    // Unpublished and no authorized draft preview → public not-found state.
    if (!site.config && !(wantPreview && canPreview)) {
      return (
        <main style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>This event website isn’t published yet</h1>
          <p style={{ color: 'var(--color-muted,#999)', maxWidth: 460 }}>Please check back soon.</p>
        </main>
      )
    }

    // Canva PDF → native converted sections (no iframe).
    if ((site.config as Record<string, unknown> | null)?.sourceType === 'canva_pdf') {
      const cfg = site.config as Record<string, unknown>
      const pages = (cfg.pages as Array<Record<string, unknown>> | undefined) ?? []
      const sections = (pages[0]?.sections as Array<Record<string, unknown>> | undefined) ?? []
      return (
        <CanvaConvertedEventView
          title={site.name}
          sections={sections as never}
          theme={(cfg.theme as Record<string, unknown>) ?? undefined}
          isDraftPreview={site.isDraftPreview}
        />
      )
    }

    const { embedUrl, sourceUrl, embedCode, isCustomDomain, povEventId } = pickEmbed(site.config)

    // Resolve POV CTA routes via the linked pov_event slug, if any.
    let cameraHref: string | null = null
    let galleryHref: string | null = null
    let loginHref: string | null = null
    if (site.pov_enabled && povEventId) {
      try {
        const { data: ev } = await povDb().from('pov_events').select('slug').eq('id', povEventId).maybeSingle()
        if (ev?.slug) {
          cameraHref = `/events/${ev.slug}/camera`
          galleryHref = `/events/${ev.slug}/gallery`
          loginHref = `/events/${ev.slug}`
        }
      } catch { /* non-fatal */ }
    }

    return (
      <CanvaEventPublicView
        embedUrl={embedUrl}
        sourceUrl={sourceUrl}
        embedCode={embedCode}
        isCustomCanvaDomain={isCustomDomain}
        title={site.name}
        cameraHref={cameraHref}
        galleryHref={galleryHref}
        loginHref={loginHref}
        isDraftPreview={site.isDraftPreview}
      />
    )
  }

  // 2) Native POV event fallback.
  const event = await resolveEvent(eventSlug)
  if (!event) notFound()

  const initialView = view === 'gallery' ? 'gallery' : view === 'capture' ? 'capture' : 'auto'
  return <PovGuestClient eventSlug={event.slug} initialView={initialView} />
}
