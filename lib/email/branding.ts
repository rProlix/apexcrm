// lib/email/branding.ts
// Resolves email branding context for a tenant/business.
// Server-only — never import in client components.
//
// Key rule:
//   - Customer-facing emails use the TENANT's brand (name, logo, colors).
//   - Platform/admin emails use Nexora branding.
//   - The verified Resend sender *address* stays fixed (it must match DNS verification),
//     but the display *name* is always the business name for tenant emails.

export type EmailBrandingMode = 'tenant' | 'platform'

export interface TenantBrandingData {
  name:          string
  slug:          string
  subdomain?:    string | null
  customDomain?: string | null
  branding?:     Record<string, unknown> | null
}

export interface ResolvedEmailBranding {
  mode:                 EmailBrandingMode
  businessName:         string   // Display name in header and subject lines
  fromName:             string   // Value used in the email From: field
  logoUrl?:             string | null
  primaryColor?:        string | null   // Hex string, e.g. "#f59e0b"
  accentColor?:         string | null
  websiteUrl?:          string | null   // Business public URL for footer link
  replyTo?:             string | null
  footerLine:           string   // Ready-to-use footer text
  showPoweredBy:        boolean  // Whether to show "Powered by Nexora"
}

// ── Platform (Nexora) fallback ────────────────────────────────────────────────

export const PLATFORM_BRANDING: ResolvedEmailBranding = {
  mode:          'platform',
  businessName:  'Nexora',
  fromName:      'Nexora',
  logoUrl:       null,
  primaryColor:  null,
  accentColor:   null,
  websiteUrl:    process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com',
  footerLine:    'Nexora · Smarter Business Management',
  showPoweredBy: false,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractJsonBrandingField(
  branding: Record<string, unknown> | null | undefined,
  field: string,
): string | null {
  if (!branding) return null
  const v = branding[field]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/**
 * Build the public website URL for a tenant.
 * Priority: customDomain → subdomain.rootDomain → app URL.
 */
function buildTenantWebsiteUrl(tenant: TenantBrandingData): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'
  if (tenant.customDomain) return `https://${tenant.customDomain}`
  const sub = tenant.subdomain ?? tenant.slug
  return `https://${sub}.${root}`
}

/**
 * Build a `ResolvedEmailBranding` from an already-loaded tenant object.
 * Use this when you already have the tenant in scope (avoids DB round-trip).
 */
export function buildEmailBrandingFromTenant(
  tenant: TenantBrandingData,
): ResolvedEmailBranding {
  const branding  = tenant.branding as Record<string, unknown> | null | undefined
  const logoUrl   = extractJsonBrandingField(branding, 'logo_url')
  const primary   = extractJsonBrandingField(branding, 'primary_color')
  const accent    = extractJsonBrandingField(branding, 'accent_color')
  const replyTo   = extractJsonBrandingField(branding, 'support_email') ??
                    extractJsonBrandingField(branding, 'reply_to_email')
  const websiteUrl = buildTenantWebsiteUrl(tenant)
  const showPoweredBy = process.env.WHITE_LABEL_SHOW_POWERED_BY === 'true'

  return {
    mode:          'tenant',
    businessName:  tenant.name,
    fromName:      tenant.name,
    logoUrl,
    primaryColor:  primary,
    accentColor:   accent,
    websiteUrl,
    replyTo,
    footerLine:    tenant.name,
    showPoweredBy,
  }
}

/**
 * Resolve email branding by loading a tenant from Supabase.
 * Returns platform fallback if tenantId is missing or the lookup fails.
 */
export async function resolveEmailBranding(
  tenantId?: string | null,
): Promise<ResolvedEmailBranding> {
  if (!tenantId) return PLATFORM_BRANDING

  try {
    const { getSupabaseServerClient } = await import('@/lib/supabase/server')
    const db = getSupabaseServerClient()

    const { data: tenant } = await db
      .from('tenants')
      .select('name, slug, subdomain, custom_domain, branding')
      .eq('id', tenantId)
      .maybeSingle()

    if (!tenant) return PLATFORM_BRANDING

    return buildEmailBrandingFromTenant({
      name:         tenant.name,
      slug:         tenant.slug,
      subdomain:    tenant.subdomain,
      customDomain: tenant.custom_domain,
      branding:     tenant.branding as Record<string, unknown> | null,
    })
  } catch {
    // Never let branding lookup break email delivery
    return PLATFORM_BRANDING
  }
}
