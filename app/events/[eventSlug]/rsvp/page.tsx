export const dynamic = 'force-dynamic'
export const revalidate = 0

// app/events/[eventSlug]/rsvp/page.tsx
// Native RSVP page for converted Canva PDF event websites.

import { notFound } from 'next/navigation'
import { resolvePublicEventWebsite } from '@/lib/website/canva/eventWebsite'
import { EventRsvpForm } from '@/components/website/canva/EventRsvpForm'
import { povDb } from '@/lib/pov/db'

interface Props { params: Promise<{ eventSlug: string }> }

export async function generateMetadata({ params }: Props) {
  const { eventSlug } = await params
  const site = await resolvePublicEventWebsite(eventSlug)
  return { title: site ? `RSVP · ${site.name}` : 'RSVP' }
}

export default async function EventRsvpPage({ params }: Props) {
  const { eventSlug } = await params
  const site = await resolvePublicEventWebsite(eventSlug)
  if (!site?.config) notFound()

  const cfg = site.config as Record<string, unknown>
  const rsvp = (cfg.rsvp as Record<string, unknown>) ?? {}
  if (rsvp.enabled === false) notFound()

  let cameraHref: string | null = null
  let galleryHref: string | null = null
  const povEventId = (cfg.povEventId as string) ?? site.pov_event_id
  if (site.pov_enabled && povEventId) {
    try {
      const { data: ev } = await povDb().from('pov_events').select('slug').eq('id', povEventId).maybeSingle()
      if (ev?.slug) {
        cameraHref = `/events/${ev.slug}/camera`
        galleryHref = `/events/${ev.slug}/gallery`
      }
    } catch { /* non-fatal */ }
  }

  const theme = (cfg.theme as Record<string, unknown>) ?? {}

  return (
    <main style={{ minHeight: '100vh', background: (theme.colors as Record<string, string>)?.background ?? '#0b0b0b' }}>
      <EventRsvpForm
        eventSlug={eventSlug}
        title={String(rsvp.pageTitle ?? 'RSVP')}
        theme={theme}
        cameraHref={cameraHref}
        galleryHref={galleryHref}
      />
    </main>
  )
}
