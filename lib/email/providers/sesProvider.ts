// lib/email/providers/sesProvider.ts
// Amazon SES v2 email delivery provider.
// Server-only — requires Node.js runtime. Never import in middleware or client components.

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import type { EmailPayload, EmailResult } from '../types'
import type { EmailConfig } from '../types'

let _client: SESv2Client | null = null

function getClient(cfg: EmailConfig): SESv2Client {
  if (!_client) {
    _client = new SESv2Client({
      region: cfg.sesRegion!,
      credentials: {
        accessKeyId:     cfg.sesAccessKeyId!,
        secretAccessKey: cfg.sesSecretAccessKey!,
      },
    })
  }
  return _client
}

export async function sendViaSES(
  payload: EmailPayload,
  cfg:     EmailConfig,
): Promise<EmailResult> {
  if (!cfg.sesRegion || !cfg.sesAccessKeyId || !cfg.sesSecretAccessKey) {
    const missing: string[] = []
    if (!cfg.sesRegion)          missing.push('AWS_SES_REGION')
    if (!cfg.sesAccessKeyId)     missing.push('AWS_SES_ACCESS_KEY_ID')
    if (!cfg.sesSecretAccessKey) missing.push('AWS_SES_SECRET_ACCESS_KEY')
    return {
      success:  false,
      provider: 'ses',
      error:    `Amazon SES is not configured: missing ${missing.join(', ')}.`,
    }
  }

  const client = getClient(cfg)

  const fromName    = payload.fromName    ?? cfg.fromName
  const fromAddress = payload.fromAddress ?? cfg.fromAddress
  const replyTo     = payload.replyTo     ?? cfg.replyTo
  const to          = Array.isArray(payload.to) ? payload.to : [payload.to]

  const cmd = new SendEmailCommand({
    Destination: { ToAddresses: to },
    FromEmailAddress: `${fromName} <${fromAddress}>`,
    FromEmailAddressIdentityArn: cfg.sesFromArn || undefined,
    ReplyToAddresses: [replyTo],
    Content: {
      Simple: {
        Subject: { Data: payload.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: payload.html,        Charset: 'UTF-8' },
          Text: { Data: payload.text ?? '',  Charset: 'UTF-8' },
        },
      },
    },
    ConfigurationSetName: cfg.sesConfigurationSet || undefined,
  })

  try {
    const res = await client.send(cmd)
    return {
      success:   true,
      provider:  'ses',
      messageId: res.MessageId,
      raw:       res,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown SES error'
    // Scrub AWS error codes to avoid leaking internal detail
    const safeMsg = msg.replace(/\b[A-Z]{2,}Exception\b/g, 'SES error')
    return { success: false, provider: 'ses', error: safeMsg, raw: err }
  }
}
