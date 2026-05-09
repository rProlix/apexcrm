// lib/email/templates/rewardNotification.ts
import { renderBaseEmail, renderBasePlainText } from './base'
import type { TemplateResult } from '../types'

export interface RewardNotificationData {
  customerName?:    string
  businessName:     string
  businessLogoUrl?: string | null
  businessWebsite?: string | null
  primaryColor?:    string | null
  pointsDelta?:     number
  pointsBalance?:   number
  rewardName?:      string
  rewardsUrl?:      string
}

export function buildRewardNotificationEmail(data: RewardNotificationData): TemplateResult {
  const { customerName, businessName, pointsDelta, pointsBalance, rewardName, rewardsUrl } = data
  const greeting = customerName ? `Hi ${customerName},` : 'Hi there,'

  const deltaText = pointsDelta !== undefined
    ? pointsDelta > 0 ? `+${pointsDelta} points` : `${pointsDelta} points`
    : null

  const bodyHtml = `
    <h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 8px;">
      ${rewardName ? `🎉 ${rewardName}` : '⭐ Rewards update'}
    </h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
      ${greeting} ${rewardName
        ? `You've earned the <strong>${rewardName}</strong> reward from ${businessName}!`
        : `Here's your latest rewards update from <strong>${businessName}</strong>.`}
    </p>
    ${deltaText || pointsBalance !== undefined ? `
    <div style="background:linear-gradient(135deg,#fef9ec,#fef3c7);border:1px solid #fde68a;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
      ${deltaText ? `<p style="color:#92400e;font-size:28px;font-weight:800;margin:0 0 4px;">${deltaText}</p>` : ''}
      ${pointsBalance !== undefined ? `<p style="color:#78350f;font-size:14px;margin:0;">Total balance: <strong>${pointsBalance} points</strong></p>` : ''}
    </div>` : ''}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
      Keep earning by visiting ${businessName}!
    </p>
  `

  const bodyText = `
${greeting} ${rewardName
    ? `You've earned the "${rewardName}" reward from ${businessName}!`
    : `Rewards update from ${businessName}.`}
${deltaText ? `Points this transaction: ${deltaText}` : ''}
${pointsBalance !== undefined ? `Total balance: ${pointsBalance} points` : ''}
  `.trim()

  return {
    subject: `Your rewards update from ${businessName}`,
    html: renderBaseEmail({
      title:              `Rewards update from ${businessName}`,
      previewText:        deltaText ? `${deltaText} from ${businessName}` : `Your rewards from ${businessName}`,
      bodyHtml,
      ctaLabel:           rewardsUrl ? 'View rewards' : undefined,
      ctaUrl:             rewardsUrl,
      tenantName:         businessName,
      tenantLogoUrl:      data.businessLogoUrl,
      tenantWebsiteUrl:   data.businessWebsite,
      tenantPrimaryColor: data.primaryColor,
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel:         rewardsUrl ? 'View rewards' : undefined,
      ctaUrl:           rewardsUrl,
      tenantName:       businessName,
      tenantWebsiteUrl: data.businessWebsite,
    }),
  }
}
