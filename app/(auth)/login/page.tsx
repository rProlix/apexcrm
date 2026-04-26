export const dynamic = 'force-dynamic'

import { redirectIfAuthed } from '@/lib/auth/redirectIfAuthed'
import { AuthCard } from '@/components/auth/AuthCard'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Sign in — ApexCRM',
}

export default async function LoginPage() {
  await redirectIfAuthed('/dashboard')

  return (
    <AuthCard>
      <LoginForm />
    </AuthCard>
  )
}
