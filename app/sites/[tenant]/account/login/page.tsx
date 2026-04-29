// app/sites/[tenant]/account/login/page.tsx
// Canonical alias: /sites/[tenant]/account/login → redirects to /sites/[tenant]/login
// This keeps the /login and /account/login routes both functional.

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

interface Props {
  params:       Promise<{ tenant: string }>
  searchParams: Promise<{ next?: string }>
}

export default async function AccountLoginAlias({ params, searchParams }: Props) {
  const { tenant }            = await params
  const { next = '/account' } = await searchParams

  const headersList = await headers()
  const isPlatform  = headersList.get('x-is-platform') === 'true'

  const nextParam = next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''

  if (isPlatform) {
    redirect(`/sites/${tenant}/login${nextParam}`)
  } else {
    redirect(`/login${nextParam}`)
  }
}
