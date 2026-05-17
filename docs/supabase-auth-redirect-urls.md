# Supabase Auth Redirect URL Configuration

> **Action required**: These settings must be configured in the Supabase Dashboard
> before customer signup confirmation emails will work correctly on business
> subdomains and custom domains.

## Dashboard Location

**Authentication → URL Configuration** in your Supabase project.

---

## Site URL

```
https://nexoranow.com
```

This is Supabase's fallback when no `emailRedirectTo` is provided. All code in
this project **always** provides an explicit `emailRedirectTo`, so this is a
safety net only.

> ⚠ **Critical**: If `emailRedirectTo` is not in the Additional Redirect URLs
> list, Supabase silently ignores it and falls back to the bare Site URL
> (`https://nexoranow.com`). This is the most common cause of confirmation emails
> linking to the wrong domain.

---

## Additional Redirect URLs

Add **all** of the following. Supabase supports `*` as a subdomain wildcard
within the same root domain.

```
https://nexoranow.com/auth/callback
https://*.nexoranow.com/auth/callback
https://nexoranow.com/reset-password
https://*.nexoranow.com/reset-password
https://*.nexoranow.com/account
https://*.nexoranow.com/invite/accept
```

### Custom Business Domains

For each business that uses their own domain, add the domain individually
(Supabase does not support wildcards for external domains):

```
https://custombusinessdomain.com/auth/callback
https://custombusinessdomain.com/account
https://custombusinessdomain.com/reset-password
https://custombusinessdomain.com/invite/accept
```

### Vercel Preview Deployments (optional)

```
https://*.vercel.app/auth/callback
https://*.vercel.app/reset-password
```

---

## How Redirect URLs Are Generated

| Flow | Helper used | Example output |
|------|-------------|----------------|
| Customer storefront signup | `getStorefrontEmailRedirectTo(request, '/account')` in `app/api/storefront/auth/signup/route.ts` | `https://erickvcontacf.nexoranow.com/auth/callback?next=%2Faccount&tenant_id=…` |
| Customer forgot password | `getStorefrontPasswordResetRedirectToFromHeaders(headers)` in `lib/actions/customer-auth.ts` | `https://erickvcontacf.nexoranow.com/auth/callback?type=recovery&next=%2Freset-password` |
| CRM business owner signup | `getCrmEmailRedirectTo('/dashboard')` in `components/auth/SignupForm.tsx` | `https://nexoranow.com/auth/callback?next=%2Fdashboard` |
| CRM onboarding wizard | `getCrmEmailRedirectTo('/dashboard')` in `components/onboarding/BusinessSignupWizard.tsx` | `https://nexoranow.com/auth/callback?next=%2Fdashboard` |
| Customer invite acceptance | `buildInviteUrl()` in `lib/invites/inviteHelpers.ts` | `https://erickvcontacf.nexoranow.com/invite/customer?token=…` |

---

## Architecture: Why API Route for Customer Signup?

The storefront customer signup uses `app/api/storefront/auth/signup/route.ts`
(not a server action) because:

1. In a Route Handler, `request.url` is the **unambiguous, definitive URL** the
   browser sent — including the exact subdomain or custom domain.
2. `new URL(request.url).origin` (or `getRequestOrigin(request)`) always returns
   the storefront origin, e.g. `https://erickvcontacf.nexoranow.com`.
3. Server actions can have ambiguous `host` headers in some Vercel/proxy
   configurations — the Route Handler approach removes that ambiguity entirely.

---

## How `/auth/callback` Works

`app/auth/callback/route.ts` handles the PKCE code exchange for all flows:

1. Supabase redirects to `/auth/callback?code=…&next=…` on the **same domain**
   used in `emailRedirectTo` (e.g. `erickvcontacf.nexoranow.com/auth/callback`).
2. The **middleware passes `/auth/callback` through** unchanged for subdomain
   requests, so the root-app route handler always runs regardless of domain.
3. The handler exchanges the code, activates any pending `customer_accounts` row,
   then redirects to `next` using `new URL(destination, origin)` — staying on
   the same domain.

---

## Troubleshooting

### Email shows `redirect_to=https://nexoranow.com` (no path)

This means `emailRedirectTo` was **not** passed to Supabase, OR the URL was
not in the Additional Redirect URLs list and Supabase silently discarded it.

**Check:**
1. Server logs for `[storefront-signup-redirect]` — verify `generatedEmailRedirectTo`
   has the correct subdomain.
2. Supabase Dashboard — confirm all patterns above are in Additional Redirect URLs.
3. Use the diagnostic endpoint: `GET /api/owner/diagnostics/auth-redirects`.

### Confirmation link returns 404 on the subdomain

Ensure `middleware.ts` has the passthrough for `/auth/callback`:

```typescript
if (subdomain && (
  pathname.startsWith('/invite/') ||
  pathname === '/auth/callback'   ||
  pathname.startsWith('/auth/callback?')
)) {
  return sessionResponse  // pass through to root app
}
```

### Customer lands on nexoranow.com after confirming

The `emailRedirectTo` had the correct subdomain but the callback redirected to
the wrong origin. Check `app/auth/callback/route.ts` — it uses
`new URL(destination, origin)` where `origin = new URL(request.url).origin`.
If `request.url` shows the wrong host, check Vercel headers configuration.

### Customer account still "pending_confirmation" after confirming

The `/auth/callback` handler calls `activate_pending_customer_account` RPC.
Check server logs for activation errors. Even if activation fails, `customerLogin`
auto-activates when it sees `email_confirmed_at` is set in Supabase Auth.

---

## Running the Redirect URL Tests

```bash
npx tsx scripts/test-auth-redirects.ts
```

All assertions should pass. If any fail, fix the underlying helper before
deploying.
