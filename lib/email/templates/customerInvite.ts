// lib/email/templates/customerInvite.ts
// Customer invite email template — polished HTML with plain-text fallback.

export interface CustomerInviteEmailData {
  businessName:    string
  businessLogoUrl?: string
  customerName?:   string
  inviteUrl:       string
  expiresAt:       Date | string
  enabledModules?: {
    appointments?: boolean
    orders?:       boolean
    rewards?:      boolean
    payments?:     boolean
  }
}

export function buildCustomerInviteEmail(data: CustomerInviteEmailData): {
  subject: string
  html:    string
  text:    string
} {
  const {
    businessName,
    businessLogoUrl,
    customerName,
    inviteUrl,
    expiresAt,
    enabledModules = {},
  } = data

  const greeting = customerName ? `Hi ${customerName},` : 'Hi there,'

  const expDate = new Date(expiresAt)
  const expFormatted = expDate.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const features: string[] = []
  if (enabledModules.appointments) features.push('📅 View and manage your appointments')
  if (enabledModules.orders)       features.push('🛍️ Track your orders and purchase history')
  if (enabledModules.rewards)      features.push('⭐ Check your rewards points and loyalty perks')
  if (enabledModules.payments)     features.push('💳 View invoices and payment history')
  features.push('👤 Manage your profile and preferences')

  const featuresHtml = features
    .map(f => `<li style="padding:4px 0;color:#374151;">${f}</li>`)
    .join('\n')

  const featuresTxt = features.map(f => `  • ${f.replace(/[^\w\s,.()']/g, '')}`).join('\n')

  const logoHtml = businessLogoUrl
    ? `<img src="${businessLogoUrl}" alt="${businessName} logo" style="height:48px;max-width:200px;object-fit:contain;margin-bottom:8px;" />`
    : `<div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#111;font-weight:800;font-size:18px;">${businessName.slice(0,2).toUpperCase()}</div>`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>You're invited to ${businessName}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#111827 0%,#1f2937 100%);padding:32px 40px;text-align:center;">
              ${logoHtml}
              <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 4px;">${businessName}</h1>
              <p style="color:#9ca3af;font-size:14px;margin:0;">Customer Portal Invitation</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#111827;font-size:16px;font-weight:600;margin:0 0 8px;">${greeting}</p>
              <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
                <strong>${businessName}</strong> has invited you to create a customer account.
                Once you accept, you'll have access to your personal portal where you can:
              </p>

              <ul style="margin:0 0 32px;padding-left:20px;list-style:none;">
                ${featuresHtml}
              </ul>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}"
                       style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#111827;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.01em;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <div style="background:#fef9ec;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-bottom:24px;">
                <p style="color:#92400e;font-size:13px;margin:0;">
                  ⏰ This invitation expires on <strong>${expFormatted}</strong>.
                  After that, you'll need to request a new invite.
                </p>
              </div>

              <!-- Fallback link -->
              <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 8px;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="color:#3b82f6;font-size:12px;word-break:break-all;margin:0 0 24px;">
                <a href="${inviteUrl}" style="color:#3b82f6;">${inviteUrl}</a>
              </p>

              <!-- Disclaimer -->
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
              <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
                If you didn't expect this invitation, you can safely ignore this email.
                No account will be created unless you click the link above.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                Sent by ${businessName} via ApexCRM &middot; Nexora
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim()

  const text = `
${greeting}

${businessName} has invited you to create a customer account.

Once you accept, you'll have access to:
${featuresTxt}

Accept your invitation here:
${inviteUrl}

This invitation expires on ${expFormatted}.

If you didn't expect this invitation, you can safely ignore this email.

---
Sent by ${businessName} via ApexCRM · Nexora
`.trim()

  return {
    subject: `You're invited to create your account with ${businessName}`,
    html,
    text,
  }
}
