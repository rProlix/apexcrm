export const dynamic = 'force-dynamic'

import { redirectIfAuthed } from '@/lib/auth/redirectIfAuthed'
import { sanitizeNextPath } from '@/lib/auth/redirects'
import { AuthCard } from '@/components/auth/AuthCard'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Sign in — ApexCRM',
}

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const nextParam = Array.isArray(params.next) ? params.next[0] : params.next
  const nextPath = sanitizeNextPath(nextParam, '/dashboard')

  await redirectIfAuthed(nextPath)

  return (
    <AuthCard>
      <LoginForm nextPath={nextPath} />
    </AuthCard>
  )
}
