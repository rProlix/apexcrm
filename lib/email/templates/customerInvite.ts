// lib/email/templates/customerInvite.ts
// Customer portal invite email — sent when a business invites a customer.
// WHITE-LABEL: shows business branding only. No Nexora logo or footer.
import { renderBaseEmail, renderBasePlainText } from './base'
import type { TemplateResult } from '../types'

export interface CustomerInviteData {
  businessName:      string
  businessLogoUrl?:  string | null
  businessWebsite?:  string | null
  primaryColor?:     string | null
  customerName?:     string
  invitedByName?:    string
  inviteUrl:         string
  expiresAt?:        Date | string
  enabledModules?: {
    appointments?: boolean
    orders?:       boolean
    rewards?:      boolean
    payments?:     boolean
  }
}

/** @deprecated Use CustomerInviteData instead */
export interface CustomerInviteEmailData extends CustomerInviteData {}

export function buildCustomerInviteEmail(data: CustomerInviteData): TemplateResult {
  const {
    businessName,
    businessLogoUrl,
    businessWebsite,
    primaryColor,
    customerName,
    invitedByName,
    inviteUrl,
    expiresAt,
    enabledModules = {},
  } = data

  const greeting     = customerName ? `Hi ${customerName},` : 'Hi there,'
  const invitedBy    = invitedByName ? ` by ${invitedByName}` : ''
  const expFormatted = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const features: string[] = []
  if (enabledModules.appointments) features.push('📅 View and manage your appointments')
  if (enabledModules.orders)       features.push('🛍️ Track your orders and purchase history')
  if (enabledModules.rewards)      features.push('⭐ Check your rewards and loyalty perks')
  if (enabledModules.payments)     features.push('💳 View invoices and payment history')
  features.push('👤 Manage your profile and preferences')

  const featuresHtml = features
    .map(f => `<li style="padding:5px 0;color:#374151;font-size:14px;">${f}</li>`)
    .join('')

  const bodyHtml = `
    <p style="color:#111827;font-size:16px;font-weight:600;margin:0 0 8px;">${greeting}</p>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
      You've been invited${invitedBy} to create a customer account with
      <strong>${businessName}</strong>. Once you accept, you'll have access to your personal portal:
    </p>
    <ul style="margin:0 0 28px;padding-left:0;list-style:none;">
      ${featuresHtml}
    </ul>
    ${expFormatted ? `
    <div style="background:#fef9ec;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-bottom:24px;">
      <p style="color:#92400e;font-size:13px;margin:0;">
        ⏰ Invite expires <strong>${expFormatted}</strong>
      </p>
    </div>` : ''}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
      If you didn't expect this invitation, you can safely ignore this email.
      No account will be created unless you click the button above.
    </p>
  `

  const bodyText = `
${greeting}

You've been invited${invitedBy} to create a customer account with ${businessName}.

With your account you'll be able to:
${features.map(f => `  • ${f.replace(/[^\w\s,.()']/g, '')}`).join('\n')}
${expFormatted ? `\nInvite expires: ${expFormatted}` : ''}

If you didn't expect this invitation, you can safely ignore this email.
  `.trim()

  return {
    subject: `You're invited to ${businessName}`,
    html: renderBaseEmail({
      title:              `Invitation from ${businessName}`,
      previewText:        `${businessName} has invited you to create your customer account`,
      bodyHtml,
      ctaLabel:           'Create your account',
      ctaUrl:             inviteUrl,
      tenantName:         businessName,
      tenantLogoUrl:      businessLogoUrl,
      tenantWebsiteUrl:   businessWebsite,
      tenantPrimaryColor: primaryColor,
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel:          'Create your account',
      ctaUrl:            inviteUrl,
      tenantName:        businessName,
      tenantWebsiteUrl:  businessWebsite,
    }),
  }
}
