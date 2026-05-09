// lib/email/templates/accountConfirmation.ts
import { renderBaseEmail, renderBasePlainText } from './base'
import type { TemplateResult } from '../types'

export interface AccountConfirmationData {
  email:           string
  confirmationUrl: string
  tenantName?:     string
  businessName?:   string
}

export function buildAccountConfirmationEmail(data: AccountConfirmationData): TemplateResult {
  const { email, confirmationUrl, tenantName, businessName } = data
  const name = businessName ?? tenantName ?? 'Nexora'

  const bodyHtml = `
    <h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 8px;">Confirm your account</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
      Welcome to ${name}! Click the button below to verify your email address and activate your account.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:24px;">
      <p style="color:#166534;font-size:13px;margin:0;">
        Confirming as: <strong>${email}</strong>
      </p>
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
      If you didn't create an account, you can safely ignore this email.
      This link expires in 24 hours.
    </p>
  `

  const bodyText = `
Welcome to ${name}!

Confirm your email address to activate your account.
Email: ${email}

This link expires in 24 hours.
If you didn't create an account, you can safely ignore this email.
  `.trim()

  return {
    subject: `Confirm your account${name !== 'Nexora' ? ` — ${name}` : ''}`,
    html:    renderBaseEmail({
      title:       'Confirm your account',
      previewText: `Confirm your email address to activate your ${name} account`,
      bodyHtml,
      ctaLabel:  'Confirm account',
      ctaUrl:    confirmationUrl,
      tenantName: tenantName ?? businessName,
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel:   'Confirm account',
      ctaUrl:     confirmationUrl,
      tenantName: tenantName ?? businessName,
    }),
  }
}
