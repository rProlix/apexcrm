export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { OnboardingClient } from './OnboardingClient'

export const metadata = {
  title: 'Setting up your workspace — ApexCRM',
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingShell step={0} />}>
      <OnboardingClient />
    </Suspense>
  )
}

function OnboardingShell({ step }: { step: number }) {
  void step
  return (
    <div className="min-h-dvh bg-graphite-950 flex items-center justify-center px-6">
      <div className="text-center max-w-sm w-full">
        <div className="inline-flex h-16 w-16 rounded-2xl bg-gold-gradient items-center justify-center mb-6 shadow-glow-gold">
          <span className="text-graphite-900 font-bold text-2xl">A</span>
        </div>
        <div className="h-2 w-full bg-graphite-800 rounded-full overflow-hidden">
          <div className="h-full w-1/4 bg-gold-gradient rounded-full animate-pulse" />
        </div>
      </div>
    </div>
  )
}
