export const dynamic = 'force-dynamic'

// app/(dashboard)/settings/email/page.tsx
// Email system settings and diagnostic panel.
// Shows provider status, allows test email sending, and displays recent email logs.

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/requireRole'
import { getProviderStatus, validateEmailConfig } from '@/lib/email/config'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { EmailSettingsClient } from '@/components/settings/EmailSettingsClient'

export const metadata = { title: 'Email Settings — Nexora' }

export default async function EmailSettingsPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const status     = getProviderStatus()
  const validation = validateEmailConfig()

  // Load recent email logs if table exists
  const db = getSupabaseServerClient()
  let recentLogs: unknown[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any)
      .from('email_logs')
      .select('id, category, to_email, subject, status, provider, message_id, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    recentLogs = data ?? []
  } catch { /* table may not exist yet */ }

  // Try to get current user email for default test recipient
  const { data: profile } = await db
    .from('users')
    .select('email')
    .eq('auth_user_id', ctx.auth_id ?? '')
    .maybeSingle()

  return (
    <EmailSettingsClient
      status={status}
      validation={validation}
      recentLogs={recentLogs}
      defaultTestEmail={profile?.email ?? ''}
      userRole={ctx.role}
    />
  )
}
