// app/sites/[tenant]/account/signup/page.tsx
// Canonical alias: /sites/[tenant]/account/signup → redirects to /sites/[tenant]/signup

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

interface Props {
  params:       Promise<{ tenant: string }>
  searchParams: Promise<{ next?: string }>
}

export default async function AccountSignupAlias({ params, searchParams }: Props) {
  const { tenant }            = await params
  const { next = '/account' } = await searchParams

  const headersList = await headers()
  const isPlatform  = headersList.get('x-is-platform') === 'true'

  const nextParam = next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''

  if (isPlatform) {
    redirect(`/sites/${tenant}/signup${nextParam}`)
  } else {
    redirect(`/signup${nextParam}`)
  }
}
