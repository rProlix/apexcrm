// lib/email/templates/passwordReset.ts
import { renderBaseEmail, renderBasePlainText } from './base'
import type { TemplateResult } from '../types'

export interface PasswordResetData {
  resetUrl:      string
  tenantName?:   string
  businessName?: string
}

export function buildPasswordResetEmail(data: PasswordResetData): TemplateResult {
  const { resetUrl, tenantName, businessName } = data
  const name = businessName ?? tenantName ?? 'Nexora'

  const bodyHtml = `
    <h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 8px;">Reset your password</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
      We received a request to reset your password for your ${name} account.
      Click below to choose a new one.
    </p>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px;margin-bottom:24px;">
      <p style="color:#9a3412;font-size:13px;margin:0;">
        ⏰ This link expires in <strong>1 hour</strong> and can only be used once.
      </p>
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
      If you didn't request a password reset, you can safely ignore this email.
      Your password won't change unless you click the link above.
    </p>
  `

  const bodyText = `
Reset your password for ${name}.

This link expires in 1 hour and can only be used once.
If you didn't request a reset, ignore this email — your password will remain unchanged.
  `.trim()

  return {
    subject: `Reset your password${name !== 'Nexora' ? ` — ${name}` : ''}`,
    html:    renderBaseEmail({
      title:       'Reset your password',
      previewText: 'Click to set a new password for your account',
      bodyHtml,
      ctaLabel:   'Reset password',
      ctaUrl:     resetUrl,
      tenantName: tenantName ?? businessName,
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel:   'Reset password',
      ctaUrl:     resetUrl,
      tenantName: tenantName ?? businessName,
    }),
  }
}
