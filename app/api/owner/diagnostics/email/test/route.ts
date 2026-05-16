// app/api/owner/diagnostics/email/test/route.ts
// POST /api/owner/diagnostics/email/test
//
// Sends a test email to verify the email provider is working correctly.
// Owner/admin only. Body: { "to": "test@example.com", "tenantId": "optional-uuid" }
//
// The email is sent using the accountConfirmation template, which exercises
// the full email pipeline: config resolution → provider → logging.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sendEmail } from '@/lib/email/sendEmail'
import { buildAccountConfirmationEmail } from '@/lib/email/templates/accountConfirmation'
import { validateEmailConfig } from '@/lib/email/config'

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx)                                   return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ ok: false, error: 'Owner or admin access required.' }, { status: 403 })

  let body: { to?: string; tenantId?: string } = {}
  try { body = await req.json() } catch { /* empty body fine */ }

  const to       = typeof body.to === 'string' ? body.to.trim() : (ctx.email ?? '')
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId : (ctx.tenant_id ?? undefined)

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({
      ok:    false,
      error: 'Provide a valid recipient email in the body: { "to": "you@example.com" }',
    }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com'

  const tpl = buildAccountConfirmationEmail({
    email:           to,
    confirmationUrl: `${appUrl}/login`,
    businessName:    'Nexora (email test)',
  })

  const result = await sendEmail({
    to,
    subject:  `[Nexora email test] ${tpl.subject}`,
    html:     tpl.html,
    text:     tpl.text,
    category: 'auth',
    tenantId,
    userId:   ctx.auth_id,
    metadata: { diagnostic: true, triggeredBy: ctx.id, testRecipient: to },
  })

  const validation = validateEmailConfig()

  return NextResponse.json({
    ok:        result.success,
    provider:  result.provider,
    messageId: result.messageId ?? null,
    to,
    error:     result.success ? null : result.error,
    hints:     result.success ? null : {
      missing:  validation.missing,
      warnings: validation.warnings,
      fix:      'See GET /api/owner/diagnostics/email for detailed config status.',
    },
  }, { status: result.success ? 200 : 500 })
}
