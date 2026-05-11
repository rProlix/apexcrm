export const dynamic = 'force-dynamic'

import { redirectIfAuthed } from '@/lib/auth/redirectIfAuthed'
import { BusinessSignupWizard } from '@/components/onboarding/BusinessSignupWizard'

export const metadata = {
  title: 'Create your workspace — Nexora',
}

export default async function SignupPage() {
  await redirectIfAuthed('/dashboard')

  return <BusinessSignupWizard />
}
