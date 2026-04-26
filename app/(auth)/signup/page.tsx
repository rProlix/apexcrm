export const dynamic = 'force-dynamic'

import { redirectIfAuthed } from '@/lib/auth/redirectIfAuthed'
import { AuthCard } from '@/components/auth/AuthCard'
import { SignupForm } from '@/components/auth/SignupForm'

export const metadata = {
  title: 'Create your workspace — ApexCRM',
}

export default async function SignupPage() {
  await redirectIfAuthed('/dashboard')

  return (
    <AuthCard>
      <SignupForm />
    </AuthCard>
  )
}
