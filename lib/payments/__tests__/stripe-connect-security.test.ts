import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  createOpaqueOAuthState,
  hashOAuthState,
  sanitizePaymentReturnPath,
  stripeKeyMatchesMode,
} from '../oauth/security'

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
