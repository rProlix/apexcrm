# Supabase Auth Redirect URL Configuration

This document describes the exact Supabase Dashboard settings required for all
auth email flows (signup confirmation, password reset, invite acceptance) to work
correctly across the main CRM domain, business subdomains, and custom domains.

## Required Settings

Navigate to: **Authentication → URL Configuration** in the Supabase Dashboard.

### Site URL

```
https://nexoranow.com
```

This is used by Supabase as the default destination when no `emailRedirectTo` is
provided. All code in this project **always** provides an explicit `emailRedirectTo`,
so the Site URL is a safety fallback only.

### Additional Redirect URLs

Supabase validates `emailRedirectTo` against this allow-list. Add all of the
following:

```
https://nexoranow.com/auth/callback
https://*.nexoranow.com/auth/callback
https://nexoranow.com/reset-password
https://*.nexoranow.com/reset-password
https://*.nexoranow.com/invite/accept
```

**Wildcard support**: Supabase supports `*` as a subdomain wildcard within the
same root domain. The patterns above cover all tenant subdomains automatically
(e.g. `erickvcontacf.nexoranow.com/auth/callback`).

#### Custom Domains

For businesses that use their own domain (e.g. `businesscustomdomain.com`),
each domain must be added individually since Supabase does not support wildcard
external domains:

```
https://businesscustomdomain.com/auth/callback
https://businesscustomdomain.com/reset-password
```

Add these when a business configures a custom domain in the CRM settings.

#### Vercel Preview Deployments (optional)

If you want confirmation emails to work in Vercel preview environments, add:

```
https://*.vercel.app/auth/callback
https://*.vercel.app/reset-password
```

## How Redirect URLs Are Generated in Code

| Flow | Code location | Redirect destination |
|------|--------------|----------------------|
| Customer storefront signup | `lib/actions/customer-auth.ts` → `getStorefrontAuthRedirectUrl()` | `https://{businessDomain}/auth/callback?next=/account&tenant_id=...` |
| Customer forgot password | `lib/actions/customer-auth.ts` → `getStorefrontPasswordResetUrl()` | `https://{businessDomain}/auth/callback?type=recovery&next=/reset-password` |
| CRM business signup (SignupForm) | `components/auth/SignupForm.tsx` | `https://nexoranow.com/auth/callback?next=/dashboard` |
| CRM business signup (Wizard) | `components/onboarding/BusinessSignupWizard.tsx` | `https://nexoranow.com/auth/callback?next=/dashboard` |
| Customer invite | `lib/invites/inviteHelpers.ts` → `buildInviteUrl()` | `https://{businessDomain}/invite/customer?token=...` |

## How /auth/callback Works

`app/auth/callback/route.ts` handles the PKCE code exchange for all flows:

1. Supabase redirects the user to `/auth/callback?code=...&next=...` on the
   **same domain that was used in `emailRedirectTo`**.
2. The middleware passes `/auth/callback` through unchanged for all subdomain
   requests (see `middleware.ts`), so the root-app route handler always runs.
3. The handler exchanges the code, activates any pending `customer_accounts` row,
   then redirects the user to `next` within the **same origin** as the callback.
4. This ensures a customer who confirmed on `erickvcontacf.nexoranow.com` is
   redirected to `erickvcontacf.nexoranow.com/account`, not `nexoranow.com`.

## Troubleshooting

### Confirmation link redirects to nexoranow.com instead of the business subdomain

1. Check the `email_redirect_to` field in server logs (logged at signup time with
   key `[auth:storefront_customer_signup]`).
2. If `email_redirect_to` contains `nexoranow.com` instead of the subdomain, the
   `x-original-host` header was not set — verify middleware is running and the
   `x-original-host` injection block is present.
3. If the URL is correct but the link still opens on the wrong domain, ensure
   the URL is in the Supabase Additional Redirect URLs list.

### Confirmation link returns 404 on the subdomain

Ensure the middleware has a passthrough for `/auth/callback` on subdomains:

```typescript
if (subdomain && (
  pathname.startsWith('/invite/') ||
  pathname === '/auth/callback'   ||
  pathname.startsWith('/auth/callback?')
)) {
  return sessionResponse  // pass through to root app
}
```

### Customer account still shows "pending_confirmation" after clicking the link

The `/auth/callback` handler calls the `activate_pending_customer_account` RPC.
If this fails (check server logs for `activate_pending_customer_account error`),
the customer can still log in — `customerLogin` has a fallback that activates
the account automatically when `email_confirmed_at` is set in Supabase.
