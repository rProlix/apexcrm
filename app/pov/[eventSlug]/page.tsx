export const dynamic  = 'force-dynamic'
export const revalidate = 0

// app/pov/[eventSlug]/page.tsx
// Public POV Event App entry: landing / register → capture → gallery.
// This route lives at the app root (outside the dashboard) so the shareable
// link / QR works on any device without a tenant subdomain rewrite.

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
  return { title: event ? `${event.name} · Event Camera` : 'Event Camera' }
}

export default async function PovPublicPage({ params, searchParams }: Props) {
  const { eventSlug } = await params
  const { view } = await searchParams
  const event = await resolveEvent(eventSlug)
  if (!event) notFound()

  const initialView = view === 'gallery' ? 'gallery' : view === 'capture' ? 'capture' : 'auto'

  return <PovGuestClient eventSlug={event.slug} initialView={initialView} />
}
