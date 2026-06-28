export const dynamic  = 'force-dynamic'
export const revalidate = 0

// app/events/[eventSlug]/gallery/page.tsx — event website gallery entry.

import { notFound } from 'next/navigation'
import { resolveEvent } from '@/lib/pov/events'
import { PovGuestClient } from '@/components/pov/PovGuestClient'

interface Props { params: Promise<{ eventSlug: string }> }

export async function generateMetadata({ params }: Props) {
  const { eventSlug } = await params
  const event = await resolveEvent(eventSlug)
  return { title: event ? `${event.name} · Gallery` : 'Event Gallery' }
}

export default async function EventGalleryPage({ params }: Props) {
  const { eventSlug } = await params
  const event = await resolveEvent(eventSlug)
  if (!event) notFound()
  return <PovGuestClient eventSlug={event.slug} initialView="gallery" />
}
