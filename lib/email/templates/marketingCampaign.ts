// lib/email/templates/marketingCampaign.ts
// Marketing emails must include unsubscribe text and respect preferences.
// Marketing is blocked at the sendEmail level when EMAIL_MARKETING_ENABLED=false.
import { renderBaseEmail, renderBasePlainText } from './base'
import type { TemplateResult } from '../types'

export interface MarketingCampaignData {
  businessName:    string
  headline:        string
  message:         string
  ctaLabel?:       string
  ctaUrl?:         string
  unsubscribeUrl?: string
  subject:         string    // caller supplies the subject for marketing emails
}

export function buildMarketingCampaignEmail(data: MarketingCampaignData): TemplateResult {
  const { businessName, headline, message, ctaLabel, ctaUrl, unsubscribeUrl, subject } = data

  const unsubBlock = unsubscribeUrl
    ? `<p style="color:#9ca3af;font-size:11px;text-align:center;margin:16px 0 0;">
        <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
        from marketing emails from ${businessName}
      </p>`
    : `<p style="color:#9ca3af;font-size:11px;text-align:center;margin:16px 0 0;">
        To unsubscribe, reply with "unsubscribe" or contact ${businessName} directly.
      </p>`

  const bodyHtml = `
    <h1 style="color:#111827;font-size:24px;font-weight:700;margin:0 0 16px;">${headline}</h1>
    <div style="color:#4b5563;font-size:15px;line-height:1.8;margin:0 0 24px;">
      ${message.split('\n').map(p => p.trim() ? `<p style="margin:0 0 12px;">${p}</p>` : '').join('')}
    </div>
    ${unsubBlock}
  `

  const bodyText = `
${headline}

${message}

${unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : 'To unsubscribe, reply with "unsubscribe".'}
  `.trim()

  return {
    subject,
    html: renderBaseEmail({
      title:       headline,
      previewText: headline,
      bodyHtml,
      ctaLabel,
      ctaUrl,
      tenantName:  businessName,
      footerText:  unsubscribeUrl
        ? `<a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>`
        : 'Reply "unsubscribe" to opt out',
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel,
      ctaUrl,
      tenantName: businessName,
    }),
  }
}
