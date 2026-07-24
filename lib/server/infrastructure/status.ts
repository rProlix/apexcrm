import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getVanDamageConfigPresence } from '@/lib/server/env'

export type InfrastructureCheck = {
  key: string
  label: string
  configured: boolean
  description: string
}

export function getRedactedInfrastructureStatus() {
  const presence = getVanDamageConfigPresence()
  const checks: InfrastructureCheck[] = [
    {
      key: 'queue',
      label: 'Queue',
      configured: presence.awsRegion && presence.sqsQueue,
      description: 'Private work queue and deployment region',
    },
    {
      key: 'storage',
      label: 'Private media storage',
      configured: presence.awsRegion && presence.s3Bucket,
      description: 'Authorized private inspection media storage',
    },
    {
      key: 'analysis',
      label: 'Automated damage analysis',
      configured: presence.aiAnalysis,
      description: 'Server-side analysis provider credentials',
    },
    {
      key: 'data',
      label: 'Data store',
      configured: presence.supabase,
      description: 'Application database and service connection',
    },
    {
      key: 'slackOAuth',
      label: 'Slack OAuth',
      configured: presence.slackOAuth && presence.tokenEncryption,
      description: 'Workspace connection and encrypted token storage',
    },
    {
      key: 'slackEvents',
      label: 'Slack Events',
      configured: presence.slackSigning,
      description: 'Signed event intake verification',
    },
  ]
  return {
    ok: checks.every((check) => check.configured),
    checks,
    deploymentEnvironment: process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV || 'unknown',
    checkedAt: new Date().toISOString(),
  }
}

export async function auditInfrastructureAction(
  actorUserId: string,
  action: string,
  metadata: Record<string, string | number | boolean | null> = {}
) {
  const { error } = await getSupabaseServerClient().from('audit_logs').insert({
    tenant_id: null,
    actor_user_id: actorUserId,
    action,
    metadata,
  })
  if (error) console.error('[infrastructure-audit] Unable to record audit event:', error.code)
}
