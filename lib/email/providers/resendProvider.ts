// lib/email/providers/resendProvider.ts
// Resend email delivery provider.
// Server-only — never import in middleware or client components.

import { Resend } from 'resend'
import type { EmailPayload, EmailResult } from '../types'
import type { EmailConfig } from '../types'
import { extractEmail } from '../config'

let _client: Resend | null = null
let _clientApiKey: string | null = null

/** Get or (re)create the Resend client if the API key changed. */
function getClient(apiKey: string): Resend {
  if (!_client || _clientApiKey !== apiKey) {
    _client    = new Resend(apiKey)
    _clientApiKey = apiKey
  }
  return _client
}

/**
 * Build the Resend `from` string.
 * - If fromAddress is already "Name <email>", use it as-is.
 * - Otherwise build "Name <email>" from separate parts.
 */
function buildFrom(fromName: string, fromAddress: string): string {
  if (fromAddress.includes('<')) {
    // Already formatted — trust it
    return fromAddress
  }
  return fromName ? `${fromName} <${fromAddress}>` : fromAddress
}

/**
 * Translate a raw Resend error message into a helpful, user-safe explanation.
 * Never exposes the raw stack or internal IDs.
 */
function humanizeResendError(message: string): string {
  const m = message.toLowerCase()

  if (m.includes('you can only send testing emails to your own email address')) {
    return (
      'Resend sandbox restriction: you can only send to your own verified email address until your domain is verified. ' +
      'Verify your sending domain at https://resend.com/domains.'
    )
  }
  if (m.includes('domain is not verified') || m.includes('not a verified domain')) {
    const domainMatch = message.match(/(\S+\.\S+)\s+domain is not verified/i)
    const domain = domainMatch?.[1] ?? 'your sending domain'
    return (
      `Resend rejected the email: ${domain} is not verified. ` +
      `Add ${domain} to your Resend account and add the required DNS records. ` +
      `Instructions: https://resend.com/domains`
    )
  }
  if (m.includes('invalid api key') || m.includes('unauthorized') || m.includes('401')) {
    return (
      'Resend API key is invalid or unauthorised. ' +
      'Check that RESEND_API_KEY is set correctly (keys start with "re_").'
    )
  }
  if (m.includes('rate limit') || m.includes('429') || m.includes('too many')) {
    return 'Resend rate limit reached. Please try again in a moment.'
  }
  if (m.includes('invalid email') || m.includes('invalid_to') || m.includes('recipient')) {
    return 'The recipient email address is invalid or was rejected by Resend.'
  }
  if (m.includes('from') && (m.includes('invalid') || m.includes('not allowed') || m.includes('not permitted'))) {
    return (
      `Resend rejected the from address. Make sure your sending domain is verified at ` +
      `https://resend.com/domains and that RESEND_FROM_EMAIL matches a verified sender.`
    )
  }
  // Return the original if no known pattern — it's already from Resend's own error message
  return `Resend error: ${message}`
}

export async function sendViaResend(
  payload: EmailPayload,
  cfg:     EmailConfig,
): Promise<EmailResult> {
  if (!cfg.resendApiKey) {
    return {
      success:  false,
      provider: 'resend',
      error:    'Resend API key is missing. Add RESEND_API_KEY to your environment variables.',
    }
  }

  if (!cfg.fromAddress) {
    return {
      success:  false,
      provider: 'resend',
      error:
        'Sender address is not configured. Set RESEND_FROM_EMAIL (or EMAIL_FROM_ADDRESS) ' +
        'to a verified sender in your Resend account.',
    }
  }

  const client = getClient(cfg.resendApiKey)

  const fromName    = payload.fromName    ?? cfg.fromName
  const fromAddress = payload.fromAddress ?? cfg.fromAddress
  const replyTo     = payload.replyTo     ?? cfg.replyTo

  // Bare address for reply-to
  const replyToEmail = replyTo ? extractEmail(replyTo) : undefined

  const to = Array.isArray(payload.to) ? payload.to : [payload.to]

  // Convert tags Record → Resend tag array
  const tags = payload.tags
    ? Object.entries(payload.tags).map(([name, value]) => ({ name, value }))
    : undefined

  const from = buildFrom(fromName, fromAddress)

  try {
    const { data, error } = await client.emails.send({
      from,
      to,
      subject: payload.subject,
      html:    payload.html,
      text:    payload.text,
      replyTo: replyToEmail,
      tags,
    })

    if (error) {
      const safeMsg = humanizeResendError(error.message ?? 'Unknown Resend error')
      console.error('[resendProvider] send failed:', {
        error:       error.message,
        name:        error.name,
        from:        from.replace(/[^@\s<>]+@[^\s>]+/, '***@***'),
        to:          to.map(a => a.replace(/[^@\s]+@/, '***@')),
        subject:     payload.subject,
      })
      return {
        success:  false,
        provider: 'resend',
        error:    safeMsg,
        raw:      { name: error.name },
      }
    }

    return {
      success:   true,
      provider:  'resend',
      messageId: data?.id,
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Unknown error'
    const safeMsg = humanizeResendError(raw)
    console.error('[resendProvider] unexpected error:', raw)
    return { success: false, provider: 'resend', error: safeMsg }
  }
}
