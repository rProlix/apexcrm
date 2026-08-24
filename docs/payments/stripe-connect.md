# Stripe Connect production configuration

Nexora uses Stripe's classic Connect OAuth flow for tenant-owned Standard accounts. All connected-account API calls use the platform secret key with the stored `acct_...` account ID. Deprecated OAuth access and refresh tokens are not used for new connections.

## Required production variables

- `STRIPE_SECRET_KEY` — platform secret key; mode must match the connected accounts.
- `STRIPE_CLIENT_ID` — Connect OAuth client ID from the same Stripe platform and mode.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the connected-account webhook endpoint.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — platform publishable key.
- `NEXT_PUBLIC_APP_URL=https://nexoranow.com` — canonical trusted application origin.

Never store values in source control, tenant provider JSON, browser storage, or logs. Configure them in the deployment environment and redeploy after changes.

## Stripe Dashboard settings

Register this exact OAuth redirect URI:

`https://nexoranow.com/api/payments/oauth/stripe/callback`

Create a webhook endpoint for events on **Connected accounts** at:

`https://nexoranow.com/api/payments/webhooks/stripe`

Subscribe to:

- `account.updated`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `checkout.session.completed`
- `charge.refunded`

The post-connect application page is:

`https://nexoranow.com/payments/providers`

## Release verification

1. Apply the Supabase migration before deploying application code.
2. Confirm all five production variables are present without printing their values.
3. Redeploy production so the server runtime receives the variables.
4. Connect a fresh Stripe test Standard account as a tenant admin.
5. Confirm the account ID, mode, and capabilities appear in Payment Providers.
6. Replay each subscribed test event and confirm it reaches the correct tenant once.
7. Create, refund, and inspect a test payment; verify every record includes the same connected account ID.
8. Disconnect and confirm subsequent payment attempts fail closed until reconnection.
