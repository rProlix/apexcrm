import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  createOpaqueOAuthState,
  hashOAuthState,
  sanitizePaymentReturnPath,
  stripeKeyMatchesMode,
} from '../oauth/security'

const root = new URL('../../../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')

test('OAuth state is opaque, high entropy, and hashes deterministically', () => {
  const first = createOpaqueOAuthState()
  const second = createOpaqueOAuthState()
  assert.notEqual(first, second)
  assert.ok(first.length >= 43)
  assert.match(hashOAuthState(first), /^[a-f0-9]{64}$/)
  assert.equal(hashOAuthState(first), hashOAuthState(first))
})

test('OAuth return URLs are restricted to the payment provider page', () => {
  assert.equal(sanitizePaymentReturnPath('/payments/providers'), '/payments/providers')
  assert.equal(sanitizePaymentReturnPath('https://attacker.example'), '/payments/providers')
  assert.equal(sanitizePaymentReturnPath('//attacker.example'), '/payments/providers')
})

test('Stripe key mode must match the connected account mode', () => {
  assert.equal(stripeKeyMatchesMode('sk_test_example', false), true)
  assert.equal(stripeKeyMatchesMode('sk_live_example', true), true)
  assert.equal(stripeKeyMatchesMode('sk_test_example', true), false)
})

test('Stripe callback does not persist deprecated OAuth bearer tokens', () => {
  const callback = readFileSync(
    new URL('../../../app/api/payments/oauth/stripe/callback/route.ts', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(callback, /tokenResponse\.access_token/)
  assert.doesNotMatch(callback, /tokenResponse\.refresh_token/)
  assert.match(callback, /consumeOAuthState/)
  assert.match(callback, /connect_stripe_account/)
})

test('Stripe webhook uses signed raw input and account mapping', () => {
  const webhook = readFileSync(
    new URL('../../../app/api/payments/webhooks/stripe/route.ts', import.meta.url),
    'utf8'
  )
  assert.match(webhook, /await req\.text\(\)/)
  assert.match(webhook, /constructEvent/)
  assert.match(webhook, /event\.account/)
  assert.match(webhook, /claimPaymentWebhookEvent/)
})

test('unauthenticated users cannot initiate Stripe connect', () => {
  const connect = source('app/api/payments/oauth/stripe/connect/route.ts')
  assert.match(connect, /if \(!context\)/)
  assert.match(connect, /authorization_required/)
})

test('ordinary staff cannot initiate Stripe connect', () => {
  const connect = source('app/api/payments/oauth/stripe/connect/route.ts')
  assert.match(connect, /\['owner', 'admin'\]\.includes\(context\.role\)/)
  assert.match(connect, /status: 403/)
})

test('tenant admins initiate connect with server-resolved tenant context', () => {
  const connect = source('app/api/payments/oauth/stripe/connect/route.ts')
  assert.match(connect, /tenantId: context\.tenant_id/)
  assert.doesNotMatch(connect, /searchParams\.get\('tenant_id'\)/)
})

test('OAuth state expires after a bounded lifetime', () => {
  const store = source('lib/payments/oauth/stateStore.ts')
  assert.match(store, /10 \* 60 \* 1000/)
  assert.match(store, /expires_at/)
  assert.match(store, /\.delete\(\)[\s\S]*\.lt\('expires_at'/)
})

test('OAuth state consumption is atomic and single use', () => {
  const migration = source('supabase/migrations/20260823210000_secure_stripe_connect.sql')
  assert.match(migration, /consume_payment_oauth_state/)
  assert.match(migration, /consumed_at IS NULL/)
  assert.match(migration, /used = false/)
  assert.match(migration, /SET consumed_at = now\(\), used = true/)
})

test('missing or invalid callback state fails closed', () => {
  const callback = source('app/api/payments/oauth/stripe/callback/route.ts')
  assert.match(callback, /if \(!code \|\| !state\)/)
  assert.match(callback, /invalid_state/)
  assert.match(source('lib/payments/oauth/stateStore.ts'), /if \(error \|\| !row\)/)
})

test('replayed state cannot pass the database consumer', () => {
  const migration = source('supabase/migrations/20260823210000_secure_stripe_connect.sql')
  assert.match(migration, /state_row\.consumed_at IS NULL/)
  assert.match(migration, /state_row\.used = false/)
})

test('tenant-swapped state is rejected against authenticated context', () => {
  const callback = source('app/api/payments/oauth/stripe/callback/route.ts')
  assert.match(callback, /context\.tenant_id !== tenantId/)
  assert.match(callback, /OAuth state does not match the authenticated tenant/)
})

test('callback cannot attach a Stripe account owned by another tenant', () => {
  const callback = source('app/api/payments/oauth/stripe/callback/route.ts')
  const migration = source('supabase/migrations/20260823210000_secure_stripe_connect.sql')
  assert.match(callback, /\.neq\('tenant_id', tenantId\)/)
  assert.match(migration, /payment_accounts_stripe_account_uidx/)
  assert.match(migration, /stripe_account_conflict/)
})

test('tenant connection reads are scoped and omit credentials', () => {
  const page = source('app/(dashboard)/payments/providers/page.tsx')
  const api = source('app/api/payments/providers/route.ts')
  assert.match(page, /\.eq\('tenant_id', tenantId\)/)
  assert.doesNotMatch(page, /access_token|refresh_token|secret_key|webhook_secret/)
  assert.match(api, /\.eq\('tenant_id', tenantId\)/)
})

test('disconnect is tenant scoped and preserves account history', () => {
  const disconnect = source('app/api/payments/providers/disconnect/route.ts')
  assert.match(disconnect, /\.eq\('tenant_id', ctx\.tenant_id\)/)
  assert.match(disconnect, /status: 'disconnected'/)
  assert.doesNotMatch(disconnect, /\.delete\(\)/)
})

test('payment routing resolves the connected account server side', () => {
  const chargeRoute = source('app/api/payments/charge/route.ts')
  const resolver = source('lib/payments/getDefaultProvider.ts')
  assert.doesNotMatch(chargeRoute, /stripe_account_id|connected_account_id/)
  assert.match(resolver, /\.eq\('tenant_id', tenantId\)/)
  assert.match(resolver, /provider_account_id/)
})

test('connected-account API calls use Stripe request options', () => {
  const adapter = source('lib/payments/adapters/stripeAdapter.ts')
  const server = source('lib/payments/stripe/server.ts')
  assert.match(adapter, /requestOptions\(config\)/)
  assert.match(server, /stripeAccount: accountId/)
})

test('invalid webhook signatures are rejected', () => {
  const webhook = source('app/api/payments/webhooks/stripe/route.ts')
  assert.match(webhook, /stripe-signature/)
  assert.match(webhook, /status: 400/)
})

test('duplicate webhook events are claimed by a unique provider event ID', () => {
  const migration = source('supabase/migrations/20260823210000_secure_stripe_connect.sql')
  const ledger = source('lib/payments/webhookEvents.ts')
  assert.match(migration, /UNIQUE \(provider, provider_event_id\)/)
  assert.match(ledger, /error\?\.code === '23505'/)
})

test('unknown connected accounts cannot mutate tenant records', () => {
  const webhook = source('app/api/payments/webhooks/stripe/route.ts')
  assert.match(webhook, /if \(!tenantId \|\| !connectedAccountId\)/)
  assert.match(webhook, /WEBHOOK_MAPPING_ERROR/)
  assert.match(webhook, /status: 500/)
})

test('OAuth tokens do not appear in browser-facing provider responses', () => {
  const api = source('app/api/payments/providers/route.ts')
  assert.doesNotMatch(api, /\.select\([^)]*access_token/)
  assert.doesNotMatch(api, /\.select\([^)]*refresh_token/)
  const purge = source('supabase/migrations/20260823213000_purge_legacy_stripe_credentials.sql')
  assert.match(purge, /WHERE provider_key = 'stripe'/)
  assert.match(purge, /SET access_token = NULL/)
  assert.match(purge, /- 'secretKey' - 'webhookSecret'/)
})

test('secret-bearing Stripe configuration stays out of the client component', () => {
  const client = source('components/payments/ProviderStatusCard.tsx')
  assert.doesNotMatch(client, /process\.env\.STRIPE_SECRET_KEY/)
  assert.doesNotMatch(client, /process\.env\.STRIPE_WEBHOOK_SECRET/)
  assert.doesNotMatch(client, /process\.env\.STRIPE_CLIENT_ID/)
})

test('missing Stripe configuration is sanitized for tenants', () => {
  const card = source('components/payments/ProviderStatusCard.tsx')
  const errors = source('lib/payments/stripe/errors.ts')
  assert.match(card, /Payment integration is temporarily unavailable/)
  assert.match(errors, /configuration_unavailable/)
})

test('test and live mode mismatch is rejected', () => {
  const callback = source('app/api/payments/oauth/stripe/callback/route.ts')
  assert.match(callback, /isStripeModeCompatible\(livemode\)/)
  assert.match(callback, /mode_mismatch/)
})

test('reconnect and account changes preserve payment history and are audited', () => {
  const callback = source('app/api/payments/oauth/stripe/callback/route.ts')
  assert.match(callback, /stripe\.reconnected/)
  assert.match(callback, /stripe\.account\.changed/)
  assert.doesNotMatch(callback, /payment_transactions[\s\S]*\.delete\(\)/)
})

test('payment records persist tenant and connected account scope', () => {
  const charge = source('lib/payments/chargeCustomer.ts')
  const links = source('lib/payments/createPaymentLink.ts')
  assert.match(charge, /tenant_id: params\.tenantId/)
  assert.match(charge, /provider_account_id: providerInfo\.accountId/)
  assert.match(links, /provider_account_id: providerInfo\.accountId/)
})

test('refunds verify tenant and connected-account ownership', () => {
  const refund = source('lib/payments/refundPayment.ts')
  assert.match(refund, /\.eq\('tenant_id', params\.tenantId\)/)
  assert.match(refund, /tx\.provider_account_id !== providerInfo\.accountId/)
})

test('Stripe integration tables enable RLS and service-only RPC access', () => {
  const migration = source('supabase/migrations/20260823210000_secure_stripe_connect.sql')
  assert.match(migration, /payment_oauth_states ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /payment_accounts ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /payment_webhook_events ENABLE ROW LEVEL SECURITY/)
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.connect_stripe_account[\s\S]*FROM authenticated/
  )
})

test('database lint repair supplies account metadata and qualifies punch-card status', () => {
  const migration = source('supabase/migrations/20260902173000_fix_database_lint_errors.sql')
  assert.match(migration, /ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL/)
  assert.match(migration, /punch_card\.status = 'active'/)
  assert.match(migration, /ELSE punch_card\.status/)
})

test('Stripe platform configuration uses bounded network retries', () => {
  const server = source('lib/payments/stripe/server.ts')
  assert.match(server, /maxNetworkRetries: 2/)
})
