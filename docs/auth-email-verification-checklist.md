# Auth & Email Verification Checklist

Use this checklist to verify the complete auth and email flow works correctly in production and preview environments.

---

## Prerequisites — One-Time Setup

### Supabase Dashboard (Authentication → URL Configuration)

Configure these settings once per project:

| Setting | Value |
|---|---|
| Site URL | `https://nexoranow.com` |
| Additional Redirect URLs | See below |

**Additional Redirect URLs to add:**
```
https://nexoranow.com/auth/callback
https://*.nexoranow.com/auth/callback
https://*.vercel.app/auth/callback
```

> **Why:** Without correct redirect URLs, Supabase will reject confirmation email links as "Redirect URL not allowed."

### Vercel Environment Variables (Settings → Environment Variables)

| Variable | Example | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abc.supabase.co` | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | ✅ (server only) |
| `NEXT_PUBLIC_APP_URL` | `https://nexoranow.com` | ✅ |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `nexoranow.com` | ✅ |
| `RESEND_API_KEY` | `re_...` | ✅ |
| `RESEND_FROM_EMAIL` | `noreply@nexoranow.com` | ✅ |
| `RESEND_FROM_NAME` | `Nexora` | Optional |
| `EMAIL_PROVIDER` | `resend` | Optional (default: resend) |

> **RESEND_FROM_EMAIL must be a verified sender domain in Resend.** Log in to [resend.com/domains](https://resend.com/domains) and verify `nexoranow.com` (or your sending domain). Do not use a free email domain (gmail.com, yahoo.com, etc.).

### Run Migration 066

```sql
-- Apply supabase/migrations/066_fix_customer_auth_rls.sql
-- This fixes the customer_accounts unique constraint and adds pending_confirmation status.
```

---

## CRM Auth Tests

### Owner Login
- [ ] Navigate to `https://nexoranow.com/login`
- [ ] Enter owner credentials → should redirect to `/dashboard`
- [ ] Refresh `/dashboard` → should stay logged in (no re-login loop)
- [ ] Navigate to `/settings` → accessible
- [ ] Sign out → redirected to `/login`

### Business Admin Login
- [ ] Log in as admin user
- [ ] Should reach `/dashboard` with tenant-scoped data only
- [ ] Cannot access other tenants' data

### Staff Login
- [ ] Log in as staff user → can access appointments, customers
- [ ] Cannot access owner-only settings

### CRM Logout
- [ ] Click logout → redirected to `/login`
- [ ] Back button after logout → does not restore session

### CRM Password Reset
- [ ] Click "Forgot password" on `/login`
- [ ] Enter CRM user email → message shown (check inbox)
- [ ] Click link in email → lands on `/reset-password` (not localhost)
- [ ] Enter new password → success message shown
- [ ] Sign in with new password → works

### CRM Signup Confirmation
- [ ] Sign up as a new business owner at `/signup`
- [ ] If email confirmation is enabled: "Check your email" shown
- [ ] Click confirmation link → **lands on `nexoranow.com/auth/callback`** (not localhost)
- [ ] Redirected to `/dashboard` after confirmation
- [ ] Tenant was created successfully

---

## Business Website Customer Auth Tests

### Customer Signup
- [ ] Navigate to `https://[tenant-subdomain].nexoranow.com/signup`
- [ ] Fill name, email, password → submit
- [ ] If email confirmation enabled: "Check your inbox" shown
  - `customers` row **created immediately** (verify in DB)
  - `customer_accounts` row **created immediately** with `status='pending_confirmation'`
- [ ] If email confirmation disabled: redirected to `/account` directly

### Customer Email Confirmation
- [ ] Click confirmation link in email
- [ ] Link URL is `https://[tenant].nexoranow.com/auth/callback?...` (not localhost)
- [ ] After click: `customer_accounts.status` updated to `'active'`
- [ ] Redirected to `/account`
- [ ] Can view account dashboard, orders, rewards

### Customer Login (After Confirmation)
- [ ] Navigate to `/login` on business website
- [ ] Enter credentials → redirected to `/account`
- [ ] Refresh `/account` → stays logged in
- [ ] `customer_accounts.status` = `'active'`

### Customer Login — Error Scenarios
- [ ] Wrong password → "Invalid email or password" (not vague error)
- [ ] Unconfirmed email → "Please confirm your email address before signing in"
- [ ] Not a customer of this business → "This email is not connected to this business yet..."
  - Does NOT say "sign up first" — suggests asking for invite
- [ ] Suspended account → "Your account has been suspended"

### Customer Account Page
- [ ] `/account` shows customer name and email
- [ ] `/account` shows rewards points balance
- [ ] Links to `/orders`, `/rewards`, `/profile`, `/shop` work

### Customer Appointment View
- [ ] Navigate to business website as logged-in customer
- [ ] `/portal/appointments` shows only this customer's appointments
- [ ] Cannot see other customers' appointments

### Customer Order History
- [ ] `/orders` shows only this customer's orders for this tenant
- [ ] Cannot see orders from other tenants

### Customer Rewards View
- [ ] `/rewards` shows this customer's points and history
- [ ] Points balance matches `rewards_balances` DB row

### Customer Logout
- [ ] Sign out button redirects to `/login` on business website
- [ ] Session cleared — visiting `/account` without login redirects back to `/login`

### Wrong-Tenant Customer Access
- [ ] Customer of Tenant A tries to log in on Tenant B's website
- [ ] Should get: "This email is not connected to this business yet"
- [ ] Should NOT be able to see Tenant B's data

---

## Business User Website Access Tests

### Business Owner Visits Own Website
- [ ] Log in as business owner on CRM (`nexoranow.com/login`)
- [ ] Visit own business subdomain (`https://my-business.nexoranow.com`)
- [ ] Should see **BusinessAdminBar** at the top of the page
- [ ] Admin bar shows: "Edit Website", "Appointments", "CRM Dashboard →"
- [ ] Does NOT see "This email is not connected to this business"
- [ ] Does NOT need a customer account

### Business Owner Website Editor Access
- [ ] From admin bar, click "Edit Website"
- [ ] Should navigate to website editor (or `/` with editing capability)

### Business Admin Visits Own Website
- [ ] Log in as admin → visit own tenant subdomain
- [ ] Admin bar shows (may not have Edit Website depending on role config)
- [ ] Can access business management features

### Business User Visits Different Tenant Website
- [ ] Log in as admin of Tenant A → visit Tenant B's subdomain
- [ ] Admin bar should NOT appear (wrong tenant)
- [ ] If trying to log in on Tenant B: "You do not have access to manage this site"

---

## Email Delivery Tests

### Email Provider Config Check
- [ ] `GET /api/owner/diagnostics/email` returns `ok: true`
- [ ] `fromEmail` is a verified Resend domain
- [ ] `resendApiKeyPresent: true`
- [ ] `missing: []` (no missing vars)

### Test Email Send
- [ ] `POST /api/owner/diagnostics/email/test` body: `{"to":"your@email.com"}`
- [ ] Response: `ok: true`, `messageId` present
- [ ] Email arrives in inbox within 60 seconds
- [ ] Email is NOT from a "Supabase" domain
- [ ] Email is from configured `RESEND_FROM_EMAIL`

### Customer Invite Email
- [ ] From CRM, go to Customers → Invite Customer
- [ ] Enter email, send invite
- [ ] Customer receives email with invite link
- [ ] Invite link opens correct business website (`https://[tenant].nexoranow.com/invite/customer?token=...`)
- [ ] Customer sets password → `customer_accounts` row created/linked
- [ ] Customer can log in after accepting

### Business Invite Email
- [ ] From CRM, invite a staff member
- [ ] Staff receives email with invite link
- [ ] Staff clicks link → can set password and log in to CRM

### Confirmation Email
- [ ] New customer signup → confirmation email arrives
- [ ] Subject includes business name (not "Supabase")
- [ ] Confirmation link goes to correct domain
- [ ] After clicking, customer lands on account page

### Password Reset Email
- [ ] Request reset from business website login page
- [ ] Email arrives with reset link
- [ ] Link goes to correct business domain (not localhost)
- [ ] After clicking, reset page shown, new password works

### Appointment Confirmation Email
- [ ] Customer books appointment
- [ ] Confirmation email arrives with appointment details
- [ ] Business name / branding visible in email

### Order Confirmation Email
- [ ] Customer places store order
- [ ] Order confirmation email arrives
- [ ] Links to order in customer portal work

### Reward Email
- [ ] Customer earns reward / punch card unlocked
- [ ] Reward notification email arrives

### Failed Email Gets Logged
- [ ] Trigger a send with invalid RESEND_FROM_EMAIL
- [ ] `email_logs` table has a row with `status = 'failed'` and a clear `error_message`
- [ ] `GET /api/owner/diagnostics/email` shows the failure in `recentFailed`

---

## Multi-Tenant Isolation Tests

### Tenant Subdomain Resolution
- [ ] `https://salon-a.nexoranow.com` → resolves to Salon A's website
- [ ] `https://salon-b.nexoranow.com` → resolves to Salon B's website
- [ ] No cross-contamination of data between A and B

### Custom Domain Resolution
- [ ] `https://www.salonbusiness.com` → resolves to correct tenant (if custom domain configured)
- [ ] Data scoped to that tenant only

### Tenant A Customer Cannot Access Tenant B
- [ ] Customer of Tenant A logs in → can only see Tenant A's portal data
- [ ] Visiting Tenant B's website while logged in as Tenant A customer → "not connected" error

### Tenant A Owner Cannot Edit Tenant B
- [ ] Owner of Tenant A visits Tenant B's admin area
- [ ] Should see Tenant B's public website, not an admin interface
- [ ] Admin bar does NOT appear for wrong-tenant visit

---

## Middleware Auth Tests

### Unauthenticated CRM Route
- [ ] Visit `nexoranow.com/dashboard` without login → redirected to `/login`
- [ ] After logging in, redirected back to `/dashboard`

### Unauthenticated Storefront Account Route
- [ ] Visit `tenant.nexoranow.com/account` without login → redirected to `/login`
- [ ] After logging in, redirected back to `/account`

### Auth Callback Reachable
- [ ] `nexoranow.com/auth/callback` is NOT blocked by middleware
- [ ] `tenant.nexoranow.com/auth/callback` is NOT blocked by middleware
- [ ] Static assets (`/_next/*`, `*.js`, `*.css`) bypass middleware

### No Infinite Login Loop
- [ ] Log in → go to `/dashboard` → refresh several times → stays logged in
- [ ] Never redirected back to login while having a valid session

---

## Common Issues and Fixes

| Symptom | Root Cause | Fix |
|---|---|---|
| Confirmation email links to localhost | `emailRedirectTo` not set in signUp call | ✅ Fixed in `customerSignup` and `SignupForm.tsx` |
| Customer can't log in after confirming email | `customer_accounts` not created before confirmation | ✅ Fixed: records now created with `pending_confirmation` status |
| "No account found for this store" for business owner | Resolver didn't check `users` table first | ✅ Fixed in `customerLogin` and `resolveSiteUser` |
| Confirmation email links rejected by Supabase | Redirect URL not in allowlist | Configure Supabase Auth → URL Configuration |
| Resend email rejected: "domain not verified" | Sending from unverified domain | Verify domain at resend.com/domains |
| Session lost after crossing subdomain | Cookie domain not set to `.nexoranow.com` | Set in `NEXT_PUBLIC_ROOT_DOMAIN` and `createSessionServerClient` |
| `customer_accounts` upsert fails | Old `auth_user_id UNIQUE` constraint | ✅ Fixed in migration 066 |
| Business admin bar not showing | `resolveSiteUser` returned null | Check `users.tenant_id` matches the tenant |
| Password reset link goes to wrong domain | `emailRedirectTo` not set in `resetPasswordForEmail` | ✅ Fixed in `customerForgotPassword` |
