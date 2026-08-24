import 'server-only'

import Stripe from 'stripe'
import { StripeIntegrationError } from './errors'
import {
  sanitizePaymentReturnPath,
  STRIPE_PAYMENTS_PATH,
  stripeKeyMatchesMode,
} from '@/lib/payments/oauth/security'

export const STRIPE_OAUTH_CALLBACK_PATH = '/api/payments/oauth/stripe/callback'
export const STRIPE_WEBHOOK_PATH = '/api/payments/webhooks/stripe'
export { STRIPE_PAYMENTS_PATH }

export interface StripeConfigPresence {
  secretKey: boolean
  clientId: boolean
  webhookSecret: boolean
  publishableKey: boolean
  appUrl: boolean
}

let platformClient: Stripe | null = null

export function getStripeConfigPresence(): StripeConfigPresence {
  return {
    secretKey: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    clientId: Boolean(process.env.STRIPE_CLIENT_ID?.trim()),
    webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    publishableKey: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()),
    appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
  }
}

export function getStripePlatformClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) {
    throw new StripeIntegrationError(
      'CONFIGURATION_ERROR',
      'STRIPE_SECRET_KEY is not configured.',
      'configuration_unavailable'
    )
  }
  platformClient ??= new Stripe(secretKey, { maxNetworkRetries: 2 })
  return platformClient
}

export function getStripeClientId(): string {
  const clientId = process.env.STRIPE_CLIENT_ID?.trim()
  if (!clientId) {
    throw new StripeIntegrationError(
      'CONFIGURATION_ERROR',
      'STRIPE_CLIENT_ID is not configured.',
      'configuration_unavailable'
    )
  }
  return clientId
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw new StripeIntegrationError(
      'CONFIGURATION_ERROR',
      'STRIPE_WEBHOOK_SECRET is not configured.',
      'configuration_unavailable'
    )
  }
  return secret
}

export function getTrustedAppUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!raw) {
    throw new StripeIntegrationError(
      'CONFIGURATION_ERROR',
      'NEXT_PUBLIC_APP_URL is not configured.',
      'configuration_unavailable'
    )
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new StripeIntegrationError(
      'CONFIGURATION_ERROR',
      'NEXT_PUBLIC_APP_URL is invalid.',
      'configuration_unavailable'
    )
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new StripeIntegrationError(
      'CONFIGURATION_ERROR',
      'Production application URL must use HTTPS.',
      'configuration_unavailable'
    )
  }
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url
}

export function stripeCallbackUrl(): string {
  return new URL(STRIPE_OAUTH_CALLBACK_PATH, getTrustedAppUrl()).toString()
}

export function stripePaymentsUrl(params?: Record<string, string>): string {
  const url = new URL(STRIPE_PAYMENTS_PATH, getTrustedAppUrl())
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value)
  return url.toString()
}

export function sanitizeStripeReturnPath(value: string | null): string {
  return sanitizePaymentReturnPath(value)
}

export function isStripeModeCompatible(livemode: boolean): boolean {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
  return stripeKeyMatchesMode(secretKey, livemode)
}

export function stripeRequestOptions(accountId?: string | null): Stripe.RequestOptions {
  if (!accountId?.startsWith('acct_')) {
    throw new StripeIntegrationError(
      'ACCOUNT_RESTRICTED',
      'A valid Stripe connected account is required.',
      'account_restricted'
    )
  }
  return { stripeAccount: accountId }
}
