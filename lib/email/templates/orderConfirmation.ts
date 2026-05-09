// lib/email/templates/orderConfirmation.ts
import { renderBaseEmail, renderBasePlainText } from './base'
import type { TemplateResult } from '../types'

export interface OrderConfirmationData {
  customerName?:    string
  businessName:     string
  businessLogoUrl?: string | null
  businessWebsite?: string | null
  primaryColor?:    string | null
  orderNumber?:     string
  orderUrl?:        string
  items?:           Array<{ name: string; price: number; quantity?: number }>
  total?:           number
  currency?:        string
}

function formatAmount(n: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
  } catch {
    return `${currency} ${n.toFixed(2)}`
  }
}

export function buildOrderConfirmationEmail(data: OrderConfirmationData): TemplateResult {
  const { customerName, businessName, orderNumber, orderUrl, items, total, currency = 'USD' } = data
  const greeting = customerName ? `Hi ${customerName},` : 'Hi there,'

  const itemsHtml = items?.length
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Item</td>
        <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:right;">Price</td>
      </tr>
      ${items.map((item, i) => `
        <tr style="${i > 0 ? 'border-top:1px solid #e5e7eb;' : ''}">
          <td style="padding:10px 14px;font-size:14px;color:#111827;">${item.name}${item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ''}</td>
          <td style="padding:10px 14px;font-size:14px;color:#111827;text-align:right;">${formatAmount(item.price, currency)}</td>
        </tr>`).join('')}
      ${total !== undefined ? `
      <tr style="border-top:2px solid #e5e7eb;">
        <td style="padding:12px 14px;font-size:14px;font-weight:700;color:#111827;">Total</td>
        <td style="padding:12px 14px;font-size:14px;font-weight:700;color:#111827;text-align:right;">${formatAmount(total, currency)}</td>
      </tr>` : ''}
    </table>` : ''

  const bodyHtml = `
    <h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 8px;">Order confirmed 🛍️</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
      ${greeting} Your order with <strong>${businessName}</strong> is confirmed.
      ${orderNumber ? `<br><span style="color:#6b7280;font-size:13px;">Order #${orderNumber}</span>` : ''}
    </p>
    ${itemsHtml}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
      Questions about your order? Contact ${businessName} directly.
    </p>
  `

  const bodyText = `
${greeting} Your order with ${businessName} is confirmed.
${orderNumber ? `Order #${orderNumber}` : ''}
${items?.length ? '\nItems:\n' + items.map(i => `  ${i.name}${i.quantity && i.quantity > 1 ? ` ×${i.quantity}` : ''}: ${formatAmount(i.price, currency)}`).join('\n') : ''}
${total !== undefined ? `\nTotal: ${formatAmount(total, currency)}` : ''}
  `.trim()

  return {
    subject: `Order confirmed with ${businessName}`,
    html: renderBaseEmail({
      title:              `Order confirmed — ${businessName}`,
      previewText:        `Your order with ${businessName} is confirmed`,
      bodyHtml,
      ctaLabel:           orderUrl ? 'View order' : undefined,
      ctaUrl:             orderUrl,
      tenantName:         businessName,
      tenantLogoUrl:      data.businessLogoUrl,
      tenantWebsiteUrl:   data.businessWebsite,
      tenantPrimaryColor: data.primaryColor,
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel:         orderUrl ? 'View order' : undefined,
      ctaUrl:           orderUrl,
      tenantName:       businessName,
      tenantWebsiteUrl: data.businessWebsite,
    }),
  }
}
