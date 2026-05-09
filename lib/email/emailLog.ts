// lib/email/emailLog.ts
// Server-side email event logger.
// Writes to the email_logs Supabase table when it exists.
// Falls back to console output. Never throws — logging must never break delivery.

import type { EmailPayload, EmailResult } from './types'
import type { EmailConfig } from './types'

interface LogEntry {
  tenant_id?:    string | null
  user_id?:      string | null
  customer_id?:  string | null
  provider:      string
  category:      string
  to_email:      string
  subject:       string
  status:        'sent' | 'failed' | 'blocked'
  message_id?:   string | null
  error_message?: string | null
  metadata?:     Record<string, unknown>
}

export async function logEmailEvent(
  payload: EmailPayload,
  result:  EmailResult,
  cfg:     EmailConfig,
): Promise<void> {
  const isDebug = cfg.logLevel === 'debug'
  const isInfo  = cfg.logLevel === 'info' || isDebug
  const isSilent = cfg.logLevel === 'silent'

  const status: LogEntry['status'] = result.success ? 'sent' : 'failed'
  const to = Array.isArray(payload.to) ? payload.to[0] : payload.to

  if (!isSilent) {
    if (result.success && isInfo) {
      console.log(
        `[email] ✓ ${status} via ${result.provider} → ${to}`,
        isDebug ? `(${payload.subject})` : '',
      )
    } else if (!result.success) {
      console.error(
        `[email] ✗ failed via ${result.provider} → ${to}: ${result.error}`,
      )
    }
  }

  const entry: LogEntry = {
    tenant_id:    payload.tenantId    ?? null,
    user_id:      payload.userId      ?? null,
    customer_id:  payload.customerId  ?? null,
    provider:     result.provider,
    category:     payload.category,
    to_email:     to,
    subject:      payload.subject,
    status,
    message_id:   result.messageId   ?? null,
    error_message: result.error       ?? null,
    metadata:     { ...(payload.metadata ?? {}), tags: payload.tags },
  }

  // Attempt DB write — never throw
  try {
    // Dynamic import so this module can be used in non-Supabase environments
    const { getSupabaseServerClient } = await import('@/lib/supabase/server')
    const db = getSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('email_logs').insert(entry)
  } catch {
    // Silently ignore — the table may not exist yet or the import may fail
  }
}
