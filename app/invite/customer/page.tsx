// app/invite/customer/page.tsx
// Public invite accept page — works on main domain and tenant subdomains.
// Token provides all tenant context; no subdomain context needed.

export const dynamic = 'force-dynamic'

import { createSessionServerClient } from '@/lib/supabase/server'
import { InviteAcceptClient } from '@/components/invite/InviteAcceptClient'
import { AlertCircle } from 'lucide-react'

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function CustomerInvitePage({ searchParams }: Props) {
  const { token } = await searchParams

  // Load current session for the "already logged in" flow
  let currentUserEmail: string | null = null
  try {
    const sessionClient = await createSessionServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    currentUserEmail = user?.email ?? null
  } catch {
    // No session — that's fine for this public page
  }

  return (
    <div className="min-h-dvh bg-graphite-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="premium-panel premium-border rounded-2xl p-8">
          {!token ? (
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <div className="h-14 w-14 rounded-2xl bg-red-400/10 border border-red-400/20 flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-red-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white mb-2">Invalid link</h1>
                <p className="text-sm text-white/50">
                  This invite link is missing required information. Please use the full link from your email.
                </p>
              </div>
            </div>
          ) : (
            <InviteAcceptClient
              token={token}
              currentUserEmail={currentUserEmail}
            />
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-white/20 mt-6">
          Powered by ApexCRM · Nexora
        </p>
      </div>
    </div>
  )
}
