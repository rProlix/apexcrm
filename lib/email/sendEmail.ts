// lib/email/sendEmail.ts
// Unified email sender — routes to Resend or Amazon SES based on EMAIL_PROVIDER.
//
// ARCHITECTURE NOTE:
//   Supabase Auth is the source of truth for users, sessions, password resets,
//   and email confirmation state. This module handles transactional and
//   marketing emails only. Do not replace Supabase Auth email flows here.
//
// Server-only — never import in client components, middleware, or edge routes.

import { getEmailConfig, assertProviderConfigured } from './config'
import { sendViaResend } from './providers/resendProvider'
import { sendViaSES }    from './providers/sesProvider'
import { logEmailEvent } from './emailLog'
import type { EmailPayload, EmailResult } from './types'

// Categories that must never be blocked, even if transactional is disabled.
const CRITICAL_CATEGORIES = new Set(['auth', 'invite'])

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const cfg = getEmailConfig()

  // ── Safety gates ────────────────────────────────────────────────────────────

  if (payload.category === 'marketing' && !cfg.marketingEnabled) {
    const result: EmailResult = {
      success:  false,
      provider: cfg.provider,
      error:    'Email blocked because marketing emails are disabled (EMAIL_MARKETING_ENABLED=false).',
    }
    await logEmailEvent(payload, result, cfg)
    return result
  }

  if (!cfg.transactionalEnabled && !CRITICAL_CATEGORIES.has(payload.category)) {
    const result: EmailResult = {
      success:  false,
      provider: cfg.provider,
      error:    'Email blocked because transactional emails are disabled (EMAIL_TRANSACTIONAL_ENABLED=false).',
    }
    await logEmailEvent(payload, result, cfg)
    return result
  }

  // ── Provider validation ──────────────────────────────────────────────────────

  let result: EmailResult
  try {
    assertProviderConfigured(cfg)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Provider not configured'
    result = { success: false, provider: cfg.provider, error: errMsg }
    await logEmailEvent(payload, result, cfg)
    return result
  }

  // ── Route to provider ────────────────────────────────────────────────────────

  try {
    if (cfg.provider === 'ses') {
      result = await sendViaSES(payload, cfg)
    } else {
      result = await sendViaResend(payload, cfg)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected email send error'
    result = { success: false, provider: cfg.provider, error: msg }
  }

  // ── Log ──────────────────────────────────────────────────────────────────────
  await logEmailEvent(payload, result, cfg)

  return result
}

// Re-export types for convenience
export type { EmailPayload, EmailResult } from './types'
