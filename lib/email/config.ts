// lib/email/config.ts
// Reads and validates email environment variables.
// Call getEmailConfig() from server-only code — never import in client components.
//
// Supported env var names (in priority order):
//
//   Provider:
//     EMAIL_PROVIDER           → "resend" | "ses"  (default: "resend")
//
//   Sender identity:
//     EMAIL_FROM_ADDRESS  OR  RESEND_FROM_EMAIL  OR  EMAIL_FROM  OR  RESEND_EMAIL_FROM
//     EMAIL_FROM_NAME     OR  RESEND_FROM_NAME   OR  APP_NAME
//     EMAIL_REPLY_TO      OR  RESEND_REPLY_TO
//
//   Feature flags:
//     EMAIL_TRANSACTIONAL_ENABLED  (default: true)
//     EMAIL_MARKETING_ENABLED      (default: false)
//     EMAIL_LOG_LEVEL              (default: "info")
//
//   Resend:
//     RESEND_API_KEY
//
//   Amazon SES:
//     AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY
//     AWS_SES_CONFIGURATION_SET (optional), AWS_SES_FROM_ARN (optional)

import type { EmailConfig } from './types'

// ── Alias resolution helpers ──────────────────────────────────────────────────

function pick(...vars: (string | undefined)[]): string | undefined {
  return vars.find(v => v && v.trim() !== '') ?? undefined
}

/** Extract bare email from "Name <email>" or plain "email" */
export function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match ? match[1].trim() : from.trim()
}

/** True if the string looks like a plausible email */
function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

// ── Config loader ─────────────────────────────────────────────────────────────

let _config: EmailConfig | null = null

/** Returns a validated email config from environment variables. Cached per process. */
export function getEmailConfig(): EmailConfig {
  if (_config) return _config

  const e = process.env

  // Resolve sender address — accept both bare email and "Name <email>" format
  const fromAddress = pick(
    e.EMAIL_FROM_ADDRESS,
    e.RESEND_FROM_EMAIL,
    e.EMAIL_FROM,
    e.RESEND_EMAIL_FROM,
  ) ?? ''   // empty string triggers a clear error at send time

  const fromName = pick(e.EMAIL_FROM_NAME, e.RESEND_FROM_NAME, e.APP_NAME) ?? 'Nexora'
  const replyTo  = pick(e.EMAIL_REPLY_TO, e.RESEND_REPLY_TO) ?? fromAddress

  const provider = (pick(e.EMAIL_PROVIDER) ?? 'resend') as 'resend' | 'ses'

  _config = {
    provider,
    fromName,
    fromAddress,
    replyTo,
    transactionalEnabled: e.EMAIL_TRANSACTIONAL_ENABLED !== 'false',
    marketingEnabled:     e.EMAIL_MARKETING_ENABLED === 'true',
    logLevel: (pick(e.EMAIL_LOG_LEVEL) as EmailConfig['logLevel']) ?? 'info',
    resendApiKey:         e.RESEND_API_KEY,
    sesRegion:            e.AWS_SES_REGION,
    sesAccessKeyId:       e.AWS_SES_ACCESS_KEY_ID,
    sesSecretAccessKey:   e.AWS_SES_SECRET_ACCESS_KEY,
    sesConfigurationSet:  e.AWS_SES_CONFIGURATION_SET,
    sesFromArn:           e.AWS_SES_FROM_ARN,
  }

  return _config
}

/** Returns a human-readable provider health summary (no secrets). */
export function getProviderStatus() {
  const cfg = getEmailConfig()
  return {
    provider:             cfg.provider,
    fromAddress:          cfg.fromAddress || '(not set)',
    fromAddressDomain:    cfg.fromAddress ? extractEmail(cfg.fromAddress).split('@')[1] ?? '' : '',
    replyTo:              cfg.replyTo || '(not set)',
    transactionalEnabled: cfg.transactionalEnabled,
    marketingEnabled:     cfg.marketingEnabled,
    resendConfigured:     Boolean(cfg.resendApiKey),
    sesConfigured:        Boolean(cfg.sesRegion && cfg.sesAccessKeyId && cfg.sesSecretAccessKey),
  }
}

/** Returns a detailed config health report — useful for diagnostics. Never exposes secret values. */
export function validateEmailConfig(): {
  ok:       boolean
  provider: string
  missing:  string[]
  warnings: string[]
} {
  const cfg  = getEmailConfig()
  const missing: string[] = []
  const warnings: string[] = []

  // ── Sender identity ──────────────────────────────────────────────────────────

  if (!cfg.fromAddress) {
    missing.push(
      'RESEND_FROM_EMAIL (or EMAIL_FROM_ADDRESS / EMAIL_FROM) — the sender address used in every email'
    )
  } else {
    const bareEmail = extractEmail(cfg.fromAddress)
    if (!isEmailLike(bareEmail)) {
      warnings.push(
        `RESEND_FROM_EMAIL "${cfg.fromAddress}" does not look like a valid email address.`
      )
    } else {
      const domain = bareEmail.split('@')[1] ?? ''
      if (domain === 'nexoranow.com') {
        warnings.push(
          `Sending from ${bareEmail}: make sure ${domain} is verified in your Resend dashboard ` +
          `(https://resend.com/domains) with the required DNS records.`
        )
      }
      if (domain === 'gmail.com' || domain === 'yahoo.com' || domain === 'hotmail.com') {
        warnings.push(
          `Free email domains like ${domain} cannot be used as a sender in Resend. ` +
          `Use a custom domain you own and have verified in Resend.`
        )
      }
    }
  }

  // ── Provider-specific ────────────────────────────────────────────────────────

  if (cfg.provider === 'resend') {
    if (!cfg.resendApiKey) {
      missing.push('RESEND_API_KEY — get this from https://resend.com/api-keys')
    } else if (!cfg.resendApiKey.startsWith('re_')) {
      warnings.push('RESEND_API_KEY does not start with "re_" — double-check the key copied from Resend.')
    }
  }

  if (cfg.provider === 'ses') {
    if (!cfg.sesRegion)          missing.push('AWS_SES_REGION')
    if (!cfg.sesAccessKeyId)     missing.push('AWS_SES_ACCESS_KEY_ID')
    if (!cfg.sesSecretAccessKey) missing.push('AWS_SES_SECRET_ACCESS_KEY')
  }

  // ── General warnings ─────────────────────────────────────────────────────────

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    warnings.push(
      'NEXT_PUBLIC_APP_URL is not set. Invite links will use a placeholder URL.'
    )
  }

  return {
    ok:       missing.length === 0,
    provider: cfg.provider,
    missing,
    warnings,
  }
}

/** Throws a readable error if the active provider is not fully configured. */
export function assertProviderConfigured(cfg: EmailConfig): void {
  if (!cfg.fromAddress) {
    throw new Error(
      'Email sender address is not configured. ' +
      'Set RESEND_FROM_EMAIL (or EMAIL_FROM_ADDRESS) to a verified sender address in Resend. ' +
      'Example: RESEND_FROM_EMAIL=noreply@yourdomain.com'
    )
  }

  if (cfg.provider === 'resend') {
    if (!cfg.resendApiKey) {
      throw new Error(
        'Resend API key is missing. Add RESEND_API_KEY to your environment variables. ' +
        'Get your key at https://resend.com/api-keys'
      )
    }
    return
  }

  if (cfg.provider === 'ses') {
    const missing: string[] = []
    if (!cfg.sesRegion)          missing.push('AWS_SES_REGION')
    if (!cfg.sesAccessKeyId)     missing.push('AWS_SES_ACCESS_KEY_ID')
    if (!cfg.sesSecretAccessKey) missing.push('AWS_SES_SECRET_ACCESS_KEY')
    if (missing.length) {
      throw new Error(
        `Amazon SES is not configured: missing ${missing.join(', ')}. ` +
        'Add them to your Vercel environment variables.'
      )
    }
  }
}

/** Reset cached config — useful in tests or when env changes. */
export function resetEmailConfigCache() {
  _config = null
}
