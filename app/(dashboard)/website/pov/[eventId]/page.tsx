export const dynamic = 'force-dynamic'

// app/(dashboard)/website/pov/[eventId]/page.tsx
// Admin control panel for a single POV Event App.

import { redirect, notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { resolveEvent } from '@/lib/pov/events'
import { canManageEvent } from '@/lib/pov/admin'
import { PovEventDashboard } from '@/components/website/pov/PovEventDashboard'

export const metadata = { title: 'POV Event App' }

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

interface Props { params: Promise<{ eventId: string }> }

export default async function PovEventPage({ params }: Props) {
  const ctx = await requireRole(['owner', 'admin'])
  const { eventId } = await params

  const event = await resolveEvent(eventId)
  if (!event) notFound()
  if (!canManageEvent(ctx, event)) redirect('/website/pov')

  const publicBase =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? `https://${ROOT_DOMAIN}`

  return <PovEventDashboard event={event} publicBase={publicBase} />
}
