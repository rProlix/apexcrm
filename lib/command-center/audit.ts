import 'server-only'

import type { Json } from '@/lib/supabase/types'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const BLOCKED_METADATA_KEYS =
  /token|secret|password|credential|payload|raw|prompt|response|api.?key/i

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown>
): Record<string, Json | undefined> {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !BLOCKED_METADATA_KEYS.test(key))
      .map(([key, value]) => [key, sanitizeValue(value)])
  )
}

export async function recordCommandAudit(input: {
  tenantId: string
  actorUserId: string | null
  action: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const { error } = await getSupabaseServerClient()
    .from('audit_logs')
    .insert({
      tenant_id: input.tenantId,
      actor_user_id: input.actorUserId,
      action: input.action,
      metadata: sanitizeAuditMetadata(input.metadata ?? {}),
    })

  if (error) {
    console.error('[command-center:audit] write failed', {
      action: input.action,
      code: error.code,
    })
  }
}

function sanitizeValue(value: unknown): Json | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeValue(item) ?? null)
  }
  if (value && typeof value === 'object') {
    return sanitizeAuditMetadata(value as Record<string, unknown>)
  }
  return undefined
}
