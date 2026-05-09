// lib/email/sendEmail.ts
// Unified email sender — routes to Resend or Amazon SES based on EMAIL_PROVIDER.
//
// ARCHITECTURE NOTE:
//   Supabase Auth is the source of truth for users, sessions, password resets,
//   and email confirmation state. This module handles transactional and
//   marketing emails only. Do not replace Supabase Auth email flows here.
//
// WHITE-LABEL:
//   When tenantId is set and no explicit fromName is provided, the tenant's
//   business name is used as the email display name:
//     "Business Name <noreply@nexoranow.com>"
//   The verified sender address stays fixed (required by Resend/SES DNS).
//
// Server-only — never import in client components, middleware, or edge routes.

import { getEmailConfig, assertProviderConfigured } from './config'
import { sendViaResend } from './providers/resendProvider'
import { sendViaSES }    from './providers/sesProvider'
import { logEmailEvent } from './emailLog'
import type { EmailPayload, EmailResult } from './types'

// Categories that must never be blocked, even if transactional is disabled.
const CRITICAL_CATEGORIES = new Set(['auth', 'invite'])

// ── Lightweight tenant name cache (avoids repeat DB hits per process lifetime) ──
const _tenantNameCache = new Map<string, string>()

async function getTenantDisplayName(tenantId: string): Promise<string | null> {
  if (_tenantNameCache.has(tenantId)) return _tenantNameCache.get(tenantId)!

  try {
    const { getSupabaseServerClient } = await import('@/lib/supabase/server')
    const { data } = await getSupabaseServerClient()
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle()

    if (data?.name) {
      _tenantNameCache.set(tenantId, data.name)
      return data.name
    }
    return null
  } catch {
    return null
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const cfg = getEmailConfig()

  // ── Safety gates ─────────────────────────────────────────────────────────────

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

  // ── Provider validation ───────────────────────────────────────────────────────

  let result: EmailResult
  try {
    assertProviderConfigured(cfg)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Provider not configured'
    result = { success: false, provider: cfg.provider, error: errMsg }
    await logEmailEvent(payload, result, cfg)
    return result
  }

  // ── White-label: resolve fromName from tenant when not explicitly set ──────────
  // Uses the business name so recipients see "Business Name <noreply@yourdomain.com>"
  // instead of "Nexora <noreply@yourdomain.com>".

  const resolvedPayload: EmailPayload = { ...payload }

  if (!resolvedPayload.fromName && resolvedPayload.tenantId) {
    const tenantName = await getTenantDisplayName(resolvedPayload.tenantId)
    if (tenantName) resolvedPayload.fromName = tenantName
  }

  // ── Route to provider ─────────────────────────────────────────────────────────

  try {
    if (cfg.provider === 'ses') {
      result = await sendViaSES(resolvedPayload, cfg)
    } else {
      result = await sendViaResend(resolvedPayload, cfg)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected email send error'
    result = { success: false, provider: cfg.provider, error: msg }
  }

  // ── Log ───────────────────────────────────────────────────────────────────────
  await logEmailEvent(resolvedPayload, result, cfg)

  return result
}

// Re-export types for convenience
export type { EmailPayload, EmailResult } from './types'
