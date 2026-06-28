export const dynamic  = 'force-dynamic'
export const revalidate = 0

// app/events/[eventSlug]/page.tsx
// Public Invitation/Event Website entry — a unique, separate URL for an event
// site that is independent of the business website. Renders the same native
// POV guest experience as /pov/[eventSlug] (landing/register → capture → gallery)
// so an event has its own /events/<slug> address that never collides with the
// business site at /sites/<tenant>.

import { notFound } from 'next/navigation'
import { resolveEvent } from '@/lib/pov/events'
import { PovGuestClient } from '@/components/pov/PovGuestClient'

interface Props {
  params: Promise<{ eventSlug: string }>
  searchParams: Promise<{ view?: string }>
}

export async function generateMetadata({ params }: Props) {
  const { eventSlug } = await params
  const event = await resolveEvent(eventSlug)
  return { title: event ? `${event.name} · Event` : 'Event' }
}

export default async function EventPublicPage({ params, searchParams }: Props) {
  const { eventSlug } = await params
  const { view } = await searchParams
  const event = await resolveEvent(eventSlug)
  if (!event) notFound()

  const initialView = view === 'gallery' ? 'gallery' : view === 'capture' ? 'capture' : 'auto'
  return <PovGuestClient eventSlug={event.slug} initialView={initialView} />
}
