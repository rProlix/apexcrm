// lib/email/templates/transactionReceipt.ts
import { renderBaseEmail, renderBasePlainText } from './base'
import type { TemplateResult } from '../types'

export interface TransactionReceiptData {
  customerName?:  string
  businessName:   string
  amount:         number
  currency:       string
  transactionId?: string
  receiptUrl?:    string
  items?:         Array<{ name: string; amount: number; quantity?: number }>
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount)
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`
  }
}

export function buildTransactionReceiptEmail(data: TransactionReceiptData): TemplateResult {
  const { customerName, businessName, amount, currency, transactionId, receiptUrl, items } = data
  const greeting = customerName ? `Hi ${customerName},` : 'Hi there,'
  const amountStr = formatCurrency(amount, currency)

  const itemsHtml = items?.length
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Item</td>
        <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:right;">Amount</td>
      </tr>
      ${items.map((item, i) => `
        <tr style="${i > 0 ? 'border-top:1px solid #e5e7eb;' : ''}">
          <td style="padding:10px 14px;font-size:14px;color:#111827;">${item.quantity && item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name}</td>
          <td style="padding:10px 14px;font-size:14px;color:#111827;text-align:right;">${formatCurrency(item.amount, currency)}</td>
        </tr>`).join('')}
      <tr style="border-top:2px solid #e5e7eb;">
        <td style="padding:12px 14px;font-size:14px;font-weight:700;color:#111827;">Total</td>
        <td style="padding:12px 14px;font-size:14px;font-weight:700;color:#111827;text-align:right;">${amountStr}</td>
      </tr>
    </table>` : `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;text-align:center;margin:0 0 24px;">
      <p style="color:#6b7280;font-size:13px;margin:0 0 4px;">Total paid</p>
      <p style="color:#111827;font-size:28px;font-weight:800;margin:0;">${amountStr}</p>
    </div>`

  const bodyHtml = `
    <h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 8px;">Payment receipt</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
      ${greeting} Thank you for your payment to <strong>${businessName}</strong>.
    </p>
    ${itemsHtml}
    ${transactionId ? `<p style="color:#9ca3af;font-size:12px;margin:0 0 20px;">Transaction ID: <code style="font-family:monospace;">${transactionId}</code></p>` : ''}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">
      Questions? Contact ${businessName} directly or reply to this email.
    </p>
  `

  const bodyText = `
${greeting} Thank you for your payment to ${businessName}.

${items?.length
    ? items.map(i => `  ${i.name}${i.quantity && i.quantity > 1 ? ` ×${i.quantity}` : ''}: ${formatCurrency(i.amount, currency)}`).join('\n') + `\n  Total: ${amountStr}`
    : `Amount: ${amountStr}`}
${transactionId ? `\nTransaction ID: ${transactionId}` : ''}
  `.trim()

  return {
    subject: `Receipt from ${businessName}`,
    html:    renderBaseEmail({
      title:       `Receipt from ${businessName}`,
      previewText: `Your payment of ${amountStr} to ${businessName} was received`,
      bodyHtml,
      ctaLabel:   receiptUrl ? 'View receipt' : undefined,
      ctaUrl:     receiptUrl,
      tenantName: businessName,
    }),
    text: renderBasePlainText({
      bodyText,
      ctaLabel:   receiptUrl ? 'View receipt' : undefined,
      ctaUrl:     receiptUrl,
      tenantName: businessName,
    }),
  }
}
