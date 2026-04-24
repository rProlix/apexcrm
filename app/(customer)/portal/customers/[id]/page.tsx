// app/(customer)/portal/customers/[id]/page.tsx
// Customer-facing: customers may only view their own record.
// Any attempt to view another customer's ID redirects to their own page.
import { headers } from 'next/headers'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ id: string }> }

export default async function CustomerPortalCustomerByIdPage({ params }: Props) {
  const { id } = await params
  const host = (await headers()).get('host') ?? ''
  const ctx  = await requireCustomerAuth(host)

  // If the requested ID matches the logged-in customer, render their account home.
  // Otherwise, redirect to their own page — no cross-customer reads.
  if (id !== ctx.customer_id) {
    redirect('/portal/customers')
  }

  redirect('/portal/customers')
}
