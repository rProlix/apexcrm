// lib/email/config.ts
// Reads and validates email environment variables.
// Call getEmailConfig() from server-only code — never import in client components.

import { z } from 'zod'
import type { EmailConfig } from './types'

const configSchema = z.object({
  provider: z.enum(['resend', 'ses']).default('resend'),
  fromName:    z.string().default('Nexora'),
  fromAddress: z.string().email().default('no-reply@nexoranow.com'),
  replyTo:     z.string().default('support@nexoranow.com'),
  transactionalEnabled: z.coerce.boolean().default(true),
  marketingEnabled:     z.coerce.boolean().default(false),
  logLevel: z.enum(['silent', 'error', 'info', 'debug']).default('info'),
  // Resend
  resendApiKey: z.string().optional(),
  // SES
  sesRegion:          z.string().optional(),
  sesAccessKeyId:     z.string().optional(),
  sesSecretAccessKey: z.string().optional(),
  sesConfigurationSet: z.string().optional(),
  sesFromArn: z.string().optional(),
})

let _config: EmailConfig | null = null

/** Returns a validated email config from environment variables. Cached after first call. */
export function getEmailConfig(): EmailConfig {
  if (_config) return _config

  const raw = configSchema.parse({
    provider:             process.env.EMAIL_PROVIDER,
    fromName:             process.env.EMAIL_FROM_NAME,
    fromAddress:          process.env.EMAIL_FROM_ADDRESS,
    replyTo:              process.env.EMAIL_REPLY_TO,
    transactionalEnabled: process.env.EMAIL_TRANSACTIONAL_ENABLED,
    marketingEnabled:     process.env.EMAIL_MARKETING_ENABLED,
    logLevel:             process.env.EMAIL_LOG_LEVEL,
    resendApiKey:         process.env.RESEND_API_KEY,
    sesRegion:            process.env.AWS_SES_REGION,
    sesAccessKeyId:       process.env.AWS_SES_ACCESS_KEY_ID,
    sesSecretAccessKey:   process.env.AWS_SES_SECRET_ACCESS_KEY,
    sesConfigurationSet:  process.env.AWS_SES_CONFIGURATION_SET,
    sesFromArn:           process.env.AWS_SES_FROM_ARN,
  })

  _config = raw as EmailConfig
  return _config
}

/** Returns a human-readable provider health summary (no secrets). */
export function getProviderStatus() {
  const cfg = getEmailConfig()
  return {
    provider:             cfg.provider,
    fromAddress:          cfg.fromAddress,
    replyTo:              cfg.replyTo,
    transactionalEnabled: cfg.transactionalEnabled,
    marketingEnabled:     cfg.marketingEnabled,
    resendConfigured:     Boolean(cfg.resendApiKey),
    sesConfigured: Boolean(
      cfg.sesRegion && cfg.sesAccessKeyId && cfg.sesSecretAccessKey
    ),
  }
}

/** Validates that the active provider is fully configured; throws a readable error if not. */
export function assertProviderConfigured(cfg: EmailConfig): void {
  if (cfg.provider === 'resend') {
    if (!cfg.resendApiKey) {
      throw new Error(
        'Email provider is not configured: missing RESEND_API_KEY. ' +
        'Add it to your environment variables.'
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
        'Add them to your environment variables.'
      )
    }
  }
}

/** Reset cached config (useful in tests). */
export function resetEmailConfigCache() {
  _config = null
}
