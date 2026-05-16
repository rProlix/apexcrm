// app/api/owner/diagnostics/email/route.ts
// GET /api/owner/diagnostics/email
//
// Returns a comprehensive email system health report for owners and admins.
// NEVER exposes API keys or credentials — only presence + validation status.
//
// Response includes:
//   - Provider config validity
//   - Missing env vars (by name only, no values)
//   - Last 20 failed email events
//   - Last 20 successfully sent email events
//   - Suggested fixes

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { validateEmailConfig, getProviderStatus, extractEmail } from '@/lib/email/config'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx)                                   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ error: 'Owner or admin access required.' }, { status: 403 })

  const status     = getProviderStatus()
  const validation = validateEmailConfig()
  const fromEmail  = status.fromAddress !== '(not set)' ? extractEmail(status.fromAddress) : ''

  const supabase = getSupabaseServerClient()

  // Fetch recent email events — try both table names (email_events and email_logs)
  // to be compatible with any migration order
  let recentFailed: unknown[] = []
  let recentSent:   unknown[] = []

  for (const tableName of ['email_logs']) {
    try {
      const { data: failed } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(tableName as any)
        .select('id, to_email, subject, status, provider, category, error_message, from_email, created_at')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(20)

      const { data: sent } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(tableName as any)
        .select('id, to_email, subject, status, provider, category, message_id, from_email, created_at')
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .limit(20)

      if (failed) recentFailed = failed
      if (sent)   recentSent   = sent
      break
    } catch {
      // Try next table
    }
  }

  // Build actionable suggested fixes
  const suggestions: string[] = []

  if (!fromEmail) {
    suggestions.push(
      'Set RESEND_FROM_EMAIL to a verified sender address, e.g. RESEND_FROM_EMAIL=noreply@yourdomain.com'
    )
  } else if (!fromEmail.includes('@')) {
    suggestions.push(
      `RESEND_FROM_EMAIL="${status.fromAddress}" does not look like a valid email. ` +
      'Use a full address like noreply@yourdomain.com'
    )
  }

  if (!status.resendConfigured && !status.sesConfigured) {
    suggestions.push('Add RESEND_API_KEY to your Vercel environment variables (Settings → Environment Variables).')
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    suggestions.push(
      'Set NEXT_PUBLIC_APP_URL=https://nexoranow.com so confirmation and invite email links work in production.'
    )
  }

  if (!process.env.NEXT_PUBLIC_ROOT_DOMAIN) {
    suggestions.push(
      'Set NEXT_PUBLIC_ROOT_DOMAIN=nexoranow.com so tenant subdomain URLs in emails resolve correctly.'
    )
  }

  const supabaseSiteUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!supabaseSiteUrl || supabaseSiteUrl.includes('localhost')) {
    suggestions.push(
      'Configure your Supabase project → Authentication → URL Configuration:\n' +
      '  Site URL: https://nexoranow.com\n' +
      '  Additional Redirect URLs:\n' +
      '    https://nexoranow.com/auth/callback\n' +
      '    https://*.nexoranow.com/auth/callback\n' +
      'Without this, confirmation email links send users to localhost.'
    )
  }

  if (validation.warnings.length > 0) {
    suggestions.push(...validation.warnings)
  }

  return NextResponse.json({
    ok:               validation.ok,
    provider:         status.provider,
    fromEmail:        fromEmail || null,
    fromEmailPresent: Boolean(fromEmail),
    fromEmailValid:   fromEmail ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail) : false,
    fromEmailDomain:  fromEmail ? fromEmail.split('@')[1] ?? null : null,
    replyTo:          status.replyTo || null,
    resendApiKeyPresent: status.resendConfigured,
    sesConfigPresent:   status.sesConfigured,
    transactionalEnabled: status.transactionalEnabled,
    marketingEnabled:     status.marketingEnabled,
    appUrl:           process.env.NEXT_PUBLIC_APP_URL || null,
    rootDomain:       process.env.NEXT_PUBLIC_ROOT_DOMAIN || null,
    missing:          validation.missing,
    warnings:         validation.warnings,
    suggestions,
    recentFailed,
    recentSent,
  })
}
