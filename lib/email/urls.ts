// lib/email/urls.ts
// URL helpers for building correct links in emails.
// Works for main domain, tenant subdomains, custom domains, and preview environments.

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com').replace(/\/$/, '')
}

function getRootDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'
}

function buildLoginUrl(): string {
  return `${getAppUrl()}/login`
}

function buildSignupUrl(): string {
  return `${getAppUrl()}/signup`
}

function buildPasswordResetUrl(token?: string): string {
  const base = `${getAppUrl()}/auth/reset-password`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

function buildCustomerInviteUrl(token: string): string {
  return `${getAppUrl()}/invite/customer?token=${encodeURIComponent(token)}`
}

function buildBusinessInviteUrl(token: string): string {
  return `${getAppUrl()}/invite/business?token=${encodeURIComponent(token)}`
}

/**
 * Builds the base URL for a tenant site.
 * Prefers customDomain → subdomain.rootDomain → appUrl.
 */
function buildTenantSiteUrl(
  subdomainOrSlug: string,
  path = '',
  opts?: { customDomain?: string | null }
): string {
  const rootDomain = getRootDomain()
  const base = opts?.customDomain
    ? `https://${opts.customDomain}`
    : `https://${subdomainOrSlug}.${rootDomain}`
  return path ? `${base}${path.startsWith('/') ? path : `/${path}`}` : base
}

function buildAppointmentUrl(tenantSlugOrDomain: string, appointmentId: string): string {
  return buildTenantSiteUrl(tenantSlugOrDomain, `/portal/appointments/${appointmentId}`)
}

function buildRewardsUrl(tenantSlugOrDomain: string): string {
  return buildTenantSiteUrl(tenantSlugOrDomain, '/portal/rewards')
}

function buildOrderUrl(tenantSlugOrDomain: string, orderId: string): string {
  return buildTenantSiteUrl(tenantSlugOrDomain, `/portal/orders/${orderId}`)
}

export {
  getAppUrl,
  getRootDomain,
  buildLoginUrl,
  buildSignupUrl,
  buildPasswordResetUrl,
  buildCustomerInviteUrl,
  buildBusinessInviteUrl,
  buildTenantSiteUrl,
  buildAppointmentUrl,
  buildRewardsUrl,
  buildOrderUrl,
}
