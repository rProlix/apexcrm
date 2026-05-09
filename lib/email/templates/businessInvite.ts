// lib/email/templates/businessInvite.ts
// Business/staff invite — sent when the owner creates or invites a CRM user.
import { renderBaseEmail, renderBasePlainText } from './base'
import type { TemplateResult } from '../types'

export interface BusinessInviteData {
  invitedName?:       string
  ownerName?:         string
  tenantName?:        string
  role:               string
  inviteUrl:          string
  temporaryPassword?: string
  expiresAt?:         Date | string
}

export function buildBusinessInviteEmail(data: BusinessInviteData): TemplateResult {
  const {
    invitedName,
    ownerName,
    tenantName,
    role,
    inviteUrl,
    temporaryPassword,
    expiresAt,
  } = data

  const greeting  = invitedName ? `Hi ${invitedName},` : 'Hi there,'
  const byLine    = ownerName ? ` by ${ownerName}` : ''
  const workspace = tenantName ?? 'your Nexora workspace'
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)

  const expFormatted = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const credBlock = temporaryPassword
    ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:24px;">
      <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 8px;">Your temporary credentials</p>
      <p style="color:#4b5563;font-size:13px;margin:0 0 4px;">Password: <code style="font-family:monospace;background:#e5e7eb;padding:2px 6px;border-radius:4px;">${temporaryPassword}</code></p>
      <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">Change your password on first login.</p>
    </div>` : ''

  const bodyHtml = `
    <h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 8px;">You've been invited to Nexora</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
      ${greeting}
    </p>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
      You've been invited${byLine} to join <strong>${workspace}</strong> as <strong>${roleLabel}</strong>.
      Click below to set up your account and start using the Nexora CRM dashboard.
    </p>
    ${credBlock}
    ${expFormatted ? `
    <div style="background:#fef9ec;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-bottom:24px;">
      <p style="color:#92400e;font-size:13px;margin:0;">⏰ Invite expires <strong>${expFormatted}</strong></p>
    </div>` : ''}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
      If you didn't expect this invitation, please contact your administrator.
    </p>
  `

  const bodyText = `
${greeting}

You've been invited${byLine} to join ${workspace} as ${roleLabel} on Nexora.
${temporaryPassword ? `\nTemporary password: ${temporaryPassword}\n(Please change on first login.)` : ''}
${expFormatted ? `\nInvite expires: ${expFormatted}` : ''}

If you didn't expect this, contact your administrator.
  `.trim()

  return {
    subject: `You've been invited to Nexora${tenantName ? ` — ${tenantName}` : ''}`,
    html:    renderBaseEmail({
      title:       'Business account invitation',
      previewText: `You've been invited to join ${workspace} as ${roleLabel}`,
      bodyHtml,
      ctaLabel:   'Accept invite',
      ctaUrl:     inviteUrl,
      tenantName,
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel:   'Accept invite',
      ctaUrl:     inviteUrl,
      tenantName,
    }),
  }
}
