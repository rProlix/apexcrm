// lib/email/sendBatchEmail.ts
// Batch email sender — sends to multiple recipients safely with chunking.
// Designed for marketing campaigns and bulk notifications.
// Server-only. Never import in client components or middleware.

import { sendEmail } from './sendEmail'
import type { EmailPayload, EmailResult } from './types'

export interface BatchRecipient {
  email:     string
  firstName?: string
  lastName?:  string
  metadata?:  Record<string, unknown>
}

export interface BatchEmailOptions {
  /** Shared payload — `to` is overridden per recipient */
  template: Omit<EmailPayload, 'to'>
  recipients: BatchRecipient[]
  /** Number of emails sent per chunk (default 10) */
  chunkSize?: number
  /** Delay between chunks in ms (default 200) */
  chunkDelayMs?: number
}

export interface BatchEmailResult {
  total:     number
  sent:      number
  failed:    number
  results:   Array<{ email: string; result: EmailResult }>
}

/**
 * Sends an email to multiple recipients in safe chunks.
 * - Respects marketing opt-out via sendEmail's category gate.
 * - Returns per-recipient results.
 * - Never throws — failures accumulate in the results array.
 */
export async function sendBatchEmail(opts: BatchEmailOptions): Promise<BatchEmailResult> {
  const { template, recipients, chunkSize = 10, chunkDelayMs = 200 } = opts

  const results: Array<{ email: string; result: EmailResult }> = []
  let sent = 0
  let failed = 0

  // Process in chunks
  for (let i = 0; i < recipients.length; i += chunkSize) {
    const chunk = recipients.slice(i, i + chunkSize)

    await Promise.all(
      chunk.map(async (recipient) => {
        try {
          const result = await sendEmail({
            ...template,
            to: recipient.email,
            metadata: {
              ...template.metadata,
              recipientFirstName: recipient.firstName,
              recipientLastName:  recipient.lastName,
              recipientMeta:      recipient.metadata,
            },
          })

          results.push({ email: recipient.email, result })

          if (result.success) {
            sent++
          } else {
            failed++
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          results.push({
            email: recipient.email,
            result: {
              success:  false,
              provider: 'resend', // placeholder — actual provider unknown at this point
              error:    msg,
            },
          })
          failed++
        }
      })
    )

    // Delay between chunks to avoid rate limits
    if (i + chunkSize < recipients.length && chunkDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, chunkDelayMs))
    }
  }

  return {
    total:   recipients.length,
    sent,
    failed,
    results,
  }
}
