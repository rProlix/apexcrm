import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getVanDamageConfigPresence } from '@/lib/server/env'
import { getStripeConfigPresence } from '@/lib/payments/stripe/server'

export type InfrastructureCheck = {
  key: string
  label: string
  configured: boolean
  description: string
}

export function getRedactedInfrastructureStatus() {
  const presence = getVanDamageConfigPresence()
  const stripe = getStripeConfigPresence()
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
    {
      key: 'stripeSecretKey',
      label: 'Stripe platform key',
      configured: stripe.secretKey,
      description: 'Server-side platform API authentication',
    },
    {
      key: 'stripeClientId',
      label: 'Stripe Connect client ID',
      configured: stripe.clientId,
      description: 'Standard account OAuth authorization',
    },
    {
      key: 'stripeWebhook',
      label: 'Stripe webhook signing',
      configured: stripe.webhookSecret,
      description: 'Connected-account event signature verification',
    },
    {
      key: 'stripePublishableKey',
      label: 'Stripe publishable key',
      configured: stripe.publishableKey,
      description: 'Browser-safe platform identifier',
    },
    {
      key: 'applicationUrl',
      label: 'Canonical application URL',
      configured: stripe.appUrl,
      description: 'Trusted OAuth callback and return URL origin',
    },
  ]
  return {
    ok: checks.every((check) => check.configured),
    checks,
    deploymentEnvironment: process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV || 'unknown',
    checkedAt: new Date().toISOString(),
  }
}

export async function getStripeOperationalStatus() {
  // Generated types are updated after the forward migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = getSupabaseServerClient() as any
  const [connections, actionRequired, failures, lastEvent] = await Promise.all([
    database
      .from('payment_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('provider_key', 'stripe')
      .neq('status', 'disconnected'),
    database
      .from('payment_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('provider_key', 'stripe')
      .in('status', ['action_required', 'restricted']),
    database
      .from('payment_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'stripe')
      .eq('status', 'failed'),
    database
      .from('payment_webhook_events')
      .select('created_at,status,event_type')
      .eq('provider', 'stripe')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return {
    connections: connections.error ? null : (connections.count ?? 0),
    actionRequired: actionRequired.error ? null : (actionRequired.count ?? 0),
    failedWebhookEvents: failures.error ? null : (failures.count ?? 0),
    lastWebhookAt: lastEvent.error ? null : (lastEvent.data?.created_at ?? null),
    lastWebhookStatus: lastEvent.error ? null : (lastEvent.data?.status ?? null),
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
