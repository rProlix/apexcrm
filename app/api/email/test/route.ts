// app/api/email/test/route.ts
// POST /api/email/test — sends a test email to verify provider configuration.
// Owner/admin only. Never exposes secrets in the response.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sendEmail } from '@/lib/email/sendEmail'
import { getEmailConfig } from '@/lib/email/config'
import {
  buildAccountConfirmationEmail,
  buildPasswordResetEmail,
  buildCustomerInviteEmail,
  buildBusinessInviteEmail,
  buildAppointmentConfirmationEmail,
} from '@/lib/email/index'
import type { EmailPayload } from '@/lib/email/types'

const SUPPORTED_TEMPLATES = [
  'accountConfirmation',
  'passwordReset',
  'customerInvite',
  'businessInvite',
  'appointmentConfirmation',
] as const

type SupportedTemplate = typeof SUPPORTED_TEMPLATES[number]

function buildTestPayload(template: SupportedTemplate, to: string): Omit<EmailPayload, 'to'> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com'
  const testBusiness = 'Acme Salon'

  switch (template) {
    case 'accountConfirmation': {
      const t = buildAccountConfirmationEmail({
        email:           to,
        confirmationUrl: `${appUrl}/auth/confirm?token=test`,
        businessName:    testBusiness,
      })
      return { ...t, category: 'auth' }
    }
    case 'passwordReset': {
      const t = buildPasswordResetEmail({
        resetUrl:    `${appUrl}/auth/reset-password?token=test`,
        businessName: testBusiness,
      })
      return { ...t, category: 'auth' }
    }
    case 'customerInvite': {
      const t = buildCustomerInviteEmail({
        businessName: testBusiness,
        inviteUrl:    `${appUrl}/invite/customer?token=test`,
        expiresAt:    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        enabledModules: { appointments: true, rewards: true, payments: true },
      })
      return { ...t, category: 'invite' }
    }
    case 'businessInvite': {
      const t = buildBusinessInviteEmail({
        invitedName: 'Test User',
        role:        'admin',
        tenantName:  testBusiness,
        inviteUrl:   `${appUrl}/login`,
      })
      return { ...t, category: 'invite' }
    }
    case 'appointmentConfirmation': {
      const t = buildAppointmentConfirmationEmail({
        businessName:    testBusiness,
        appointmentDate: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        appointmentTime: '10:00 AM – 11:00 AM',
        serviceName:     'Premium Service',
        professionalName: 'Jane Smith',
      })
      return { ...t, category: 'appointment' }
    }
    default:
      throw new Error(`Unknown template: ${template}`)
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx)                                        return NextResponse.json({ success: false, error: 'Unauthorized' },  { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))      return NextResponse.json({ success: false, error: 'Forbidden' },     { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const to       = typeof body.to       === 'string' ? body.to       : ctx.email ?? ''
  const template = (typeof body.template === 'string' ? body.template : 'accountConfirmation') as SupportedTemplate

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ success: false, error: 'Valid email address required.' }, { status: 400 })
  }

  if (!SUPPORTED_TEMPLATES.includes(template)) {
    return NextResponse.json({
      success: false,
      error:   `Unsupported template. Supported: ${SUPPORTED_TEMPLATES.join(', ')}`,
    }, { status: 400 })
  }

  const cfg = getEmailConfig()

  let templatePayload: Omit<EmailPayload, 'to'>
  try {
    templatePayload = buildTestPayload(template, to)
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 400 })
  }

  const result = await sendEmail({
    ...templatePayload,
    to,
    metadata: { test: true, triggeredBy: ctx.id },
  })

  return NextResponse.json({
    success:   result.success,
    provider:  result.provider,
    messageId: result.messageId ?? null,
    error:     result.error    ?? null,
    config: {
      provider:    cfg.provider,
      fromAddress: cfg.fromAddress,
    },
  }, { status: result.success ? 200 : 500 })
}
