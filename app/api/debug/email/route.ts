// app/api/debug/email/route.ts
// Email diagnostic endpoint — owner/admin only.
//
// GET  → returns safe config status (no secrets)
// POST → sends a test email to verify Resend is working
//
// NEVER exposes API keys or AWS credentials.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { validateEmailConfig, getProviderStatus, extractEmail } from '@/lib/email/config'
import { sendEmail } from '@/lib/email/sendEmail'
import { buildAccountConfirmationEmail } from '@/lib/email/templates/accountConfirmation'

function forbidden() {
  return NextResponse.json({ error: 'Owner or admin access required.' }, { status: 403 })
}

// ── GET /api/debug/email ──────────────────────────────────────────────────────
// Returns provider health — safe to display in the settings UI.

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx)                                   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return forbidden()

  const status     = getProviderStatus()
  const validation = validateEmailConfig()

  const fromEmail  = status.fromAddress !== '(not set)'
    ? extractEmail(status.fromAddress)
    : ''

  return NextResponse.json({
    provider:          status.provider,
    hasResendApiKey:   status.resendConfigured,
    hasSESConfig:      status.sesConfigured,
    hasFromEmail:      Boolean(fromEmail),
    fromEmail:         fromEmail || '(not configured)',
    fromEmailDomain:   fromEmail ? fromEmail.split('@')[1] ?? '' : '',
    fromName:          status.fromAddress || '(not configured)',
    replyTo:           status.replyTo,
    appUrl:            process.env.NEXT_PUBLIC_APP_URL || '(not set)',
    rootDomain:        process.env.NEXT_PUBLIC_ROOT_DOMAIN || '(not set)',
    transactionalEnabled: status.transactionalEnabled,
    marketingEnabled:     status.marketingEnabled,
    configOk:          validation.ok,
    missing:           validation.missing,
    warnings:          validation.warnings,
  })
}

// ── POST /api/debug/email ─────────────────────────────────────────────────────
// Sends a test email to verify the provider is working.

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx)                                   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return forbidden()

  let body: { to?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine — use signed-in user email */ }

  // Fall back to the signed-in user's email if no `to` provided
  const to = (typeof body.to === 'string' && body.to.trim()) ? body.to.trim() : (ctx.email ?? '')

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({
      ok:    false,
      error: 'Provide a valid recipient email in the request body: { "to": "you@example.com" }',
    }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com'

  const tpl = buildAccountConfirmationEmail({
    email:           to,
    confirmationUrl: `${appUrl}/login`,
    businessName:    'Nexora',
  })

  const result = await sendEmail({
    to,
    subject:  `[Nexora email test] ${tpl.subject}`,
    html:     tpl.html,
    text:     tpl.text,
    category: 'auth',   // critical — never blocked
    metadata: { debug: true, triggeredBy: ctx.id },
  })

  if (!result.success) {
    console.error('[debug/email] test send failed:', result.error)
  }

  return NextResponse.json({
    ok:        result.success,
    provider:  result.provider,
    messageId: result.messageId ?? null,
    to,
    error:     result.success ? null : result.error,
    // Attach config hints when it failed so the developer can fix it immediately
    hints:     result.success ? null : (() => {
      const validation = validateEmailConfig()
      return {
        missing:  validation.missing,
        warnings: validation.warnings,
        docs:     'https://resend.com/docs/send-with-resend',
      }
    })(),
  }, { status: result.success ? 200 : 500 })
}
