-- Stripe Connect now uses the platform key plus connected account IDs.
-- Purge obsolete tenant-held Stripe bearer tokens and secret JSON fields.
-- Square credentials are intentionally untouched.

UPDATE public.payment_accounts
SET access_token = NULL,
    refresh_token = NULL,
    updated_at = now()
WHERE provider_key = 'stripe'
  AND (access_token IS NOT NULL OR refresh_token IS NOT NULL);

UPDATE public.payment_providers provider
SET config = COALESCE(provider.config, '{}'::jsonb) - 'secretKey' - 'webhookSecret',
    is_enabled = EXISTS (
      SELECT 1
      FROM public.payment_accounts account
      WHERE account.tenant_id = provider.tenant_id
        AND account.provider_key = 'stripe'
        AND account.connection_method = 'oauth'
        AND account.provider_account_id IS NOT NULL
        AND account.status <> 'disconnected'
    ),
    updated_at = now()
WHERE provider.provider_key = 'stripe'
  AND (
    COALESCE(provider.config, '{}'::jsonb) ? 'secretKey'
    OR COALESCE(provider.config, '{}'::jsonb) ? 'webhookSecret'
  );

COMMENT ON COLUMN public.payment_accounts.access_token IS
  'Legacy Square OAuth token storage. Stripe Connect tokens are never persisted.';
COMMENT ON COLUMN public.payment_accounts.refresh_token IS
  'Legacy Square OAuth refresh token storage. Stripe Connect tokens are never persisted.';
