// lib/email/providers/resendProvider.ts
// Resend email delivery provider.
// Server-only — never import in middleware or client components.

import { Resend } from 'resend'
import type { EmailPayload, EmailResult } from '../types'
import type { EmailConfig } from '../types'

let _client: Resend | null = null

function getClient(apiKey: string): Resend {
  if (!_client) _client = new Resend(apiKey)
  return _client
}

export async function sendViaResend(
  payload: EmailPayload,
  cfg:     EmailConfig,
): Promise<EmailResult> {
  if (!cfg.resendApiKey) {
    return {
      success:  false,
      provider: 'resend',
      error:    'Email provider is not configured: missing RESEND_API_KEY.',
    }
  }

  const client = getClient(cfg.resendApiKey)

  const fromName    = payload.fromName    ?? cfg.fromName
  const fromAddress = payload.fromAddress ?? cfg.fromAddress
  const replyTo     = payload.replyTo     ?? cfg.replyTo
  const to          = Array.isArray(payload.to) ? payload.to : [payload.to]

  // Convert tags Record → Resend tag array
  const tags = payload.tags
    ? Object.entries(payload.tags).map(([name, value]) => ({ name, value }))
    : undefined

  try {
    const { data, error } = await client.emails.send({
      from:    `${fromName} <${fromAddress}>`,
      to,
      subject: payload.subject,
      html:    payload.html,
      text:    payload.text,
      replyTo,
      tags,
    })

    if (error) {
      return {
        success:  false,
        provider: 'resend',
        error:    error.message ?? 'Resend API returned an error',
        raw:      error,
      }
    }

    return {
      success:   true,
      provider:  'resend',
      messageId: data?.id,
      raw:       data,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Resend error'
    return { success: false, provider: 'resend', error: msg, raw: err }
  }
}
