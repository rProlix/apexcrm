/**
 * lib/onboarding/businessOnboarding.ts
 *
 * Server-side logic for the business onboarding wizard.
 * Handles saving onboarding responses, provisioning tenants,
 * applying plan module access, and creating subscriptions.
 */

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { slugifyBusinessName } from '@/lib/validation/auth'
import type { Json } from '@/lib/supabase/types'
import type { CRMPlanKey } from '@/lib/plans/planCatalog'
import type { LegalAgreement } from '@/lib/legal/consent'
import type { ModuleKey } from '@/modules/shared/moduleTypes'
import { MODULE_REGISTRY } from '@/modules/registry'
import {
  calculateSignupQuote,
  derivePlanKeyFromModules,
  getRecommendedSignupModules,
  getSignupPackageForBusinessType,
  normalizeSignupModuleSelection,
  type SignupBillingInterval,
} from '@/lib/plans/signupModulePricing'

// ── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingData {
  // Account
  email: string
  authUserId: string

  // Business basics
  businessName: string
  businessType?: string
  businessCategory?: string
  businessDescription?: string
  phone?: string
  address?: string
  existingWebsiteUrl?: string
  desiredSubdomain?: string

  // Needs
  sellsProducts?: boolean
  sellsServices?: boolean
  needsAppointments?: boolean
  needsPayments?: boolean
  needsWebsite?: boolean
  needsStore?: boolean
  needsCustomers?: boolean
  needsRewards?: boolean
  needsStaff?: boolean
  needsCustomerPortal?: boolean
  needsEmailReminders?: boolean
  needsAiBuilder?: boolean
  needsAiImages?: boolean
  needs360Products?: boolean
  needsAnalytics?: boolean

  // Size
  employeeCount?: number
  expectedMonthlyCustomers?: number
  expectedMonthlyAppointments?: number
  expectedMonthlyOrders?: number
  monthlyBudgetCents?: number

  // Module subscription
  selectedPlanKey?: CRMPlanKey
  recommendedPlanKey?: CRMPlanKey
  recommendedModules?: ModuleKey[]
  selectedModules?: ModuleKey[]
  selectedPackageKey?: string
  billingInterval?: SignupBillingInterval
  recommendationReason?: string
  legalAgreement: LegalAgreement
}

export interface OnboardingResult {
  tenantId: string
  userId: string
  tenantSlug: string
  planKey: CRMPlanKey
  enabledModules: string[]
  lockedModules: string[]
}

// ── Public helpers ────────────────────────────────────────────────────────────

/** Normalize a business type string to a lowercase canonical form */
export function normalizeBusinessType(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Sanitize a desired subdomain slug */
export function sanitizeSubdomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

// ── Core onboarding flow ──────────────────────────────────────────────────────

/**
 * Completes the full business onboarding:
 * 1. Creates or reuses the tenant
 * 2. Creates or reuses the user profile
 * 3. Saves onboarding answers
 * 4. Creates a subscription
 * 5. Applies plan modules (enable/lock)
 */
export async function completeBusinessOnboarding(data: OnboardingData): Promise<OnboardingResult> {
  const supabase = getSupabaseServerClient() as any
  const fallbackModules = getRecommendedSignupModules({
    businessType: data.businessCategory ?? data.businessType,
    needs: [
      data.needsAppointments && 'appointments',
      data.needsPayments && 'payments',
      data.needsWebsite && 'website',
      data.needsStore && 'store',
      data.needsCustomers && 'customers',
      data.needsRewards && 'rewards',
      data.needsEmailReminders && 'messages',
      data.needs360Products && '360',
    ].filter(Boolean),
    sellsProducts: data.sellsProducts,
    offersServices: data.sellsServices,
  })
  const selectedModules = normalizeSignupModuleSelection(data.selectedModules ?? fallbackModules)
  const planKey = derivePlanKeyFromModules(selectedModules)
  const billingInterval = data.billingInterval === 'yearly' ? 'yearly' : 'monthly'
  const quote = calculateSignupQuote(selectedModules, billingInterval)
  const selectedPackage = getSignupPackageForBusinessType(
    data.businessCategory ?? data.businessType
  )

  // Verify the auth user exists
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(
    data.authUserId
  )
  if (authError || !authData?.user) {
    throw new Error('Unable to verify your account. Please try signing up again.')
  }

  // Idempotency check
  const { data: existing } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('auth_user_id', data.authUserId)
    .maybeSingle()

  let tenantId: string
  let userId: string
  let tenantSlug: string

  if (existing?.tenant_id) {
    // Already created — just update the onboarding responses and modules
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', existing.tenant_id)
      .single()
    tenantId = existing.tenant_id
    userId = existing.id
    tenantSlug = existingTenant?.slug ?? ''
  } else {
    // Create tenant + user profile
    const baseSlug = data.desiredSubdomain
      ? sanitizeSubdomain(data.desiredSubdomain)
      : slugifyBusinessName(data.businessName)
    const finalSlug = await resolveUniqueSlug(supabase, baseSlug)

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .insert({
        name: data.businessName.trim(),
        slug: finalSlug,
        subdomain: finalSlug,
        status: 'active',
        branding: {
          primary_color: '#c9a84c',
          accent: 'gold',
          industry: data.businessCategory ?? data.businessType ?? 'general',
          logo_url: null,
        },
      })
      .select('id, slug')
      .single()

    if (tenantErr || !tenant) {
      throw new Error(
        tenantErr?.code === '23505'
          ? 'That business slug is already taken. Please choose a different name.'
          : 'Failed to create your workspace. Please try again.'
      )
    }

    const { data: userRecord, error: userErr } = await supabase
      .from('users')
      .insert({
        tenant_id: tenant.id,
        auth_user_id: data.authUserId,
        email: data.email,
        role: 'admin',
        status: 'active',
        metadata: { businessName: data.businessName.trim() },
      })
      .select('id')
      .single()

    if (userErr || !userRecord) {
      await supabase.from('tenants').delete().eq('id', tenant.id)
      throw new Error('Failed to create your profile. Please try again.')
    }

    await supabase.auth.admin.updateUserById(data.authUserId, {
      user_metadata: {
        role: 'admin',
        businessName: data.businessName.trim(),
        tenant_id: tenant.id,
      },
    })

    // Provision subdomain
    await supabase
      .from('tenant_domains')
      .insert({
        tenant_id: tenant.id,
        hostname: finalSlug,
        domain_type: 'subdomain',
        is_primary: true,
        is_verified: true,
        verified: true,
        ssl_status: 'active',
        verification_method: null,
        verification_token: null,
        metadata: {},
      })
      .maybeSingle()

    await supabase.from('site_settings').upsert(
      {
        tenant_id: tenant.id,
        subdomain: finalSlug,
        domain_type: 'subdomain',
        domain_mode: 'subdomain',
        is_published: false,
      },
      { onConflict: 'tenant_id' }
    )

    tenantId = tenant.id
    userId = userRecord.id
    tenantSlug = finalSlug
  }

  // Apply the exact paid module selection (enable selected + lock unselected)
  const { enabledModules, lockedModules } = await applyPlanModulesToTenant({
    tenantId,
    selectedModules,
  })

  // Create subscription
  await createTenantSubscription({
    supabase,
    tenantId,
    planKey,
    billingInterval,
    selectedModules,
    selectedPackageKey: data.selectedPackageKey || selectedPackage.key,
    quote,
  })

  // Save onboarding responses
  await saveOnboardingResponse(
    supabase,
    tenantId,
    data.authUserId,
    { ...data, selectedPlanKey: planKey, selectedModules, billingInterval },
    enabledModules,
    lockedModules,
    quote,
    data.selectedPackageKey || selectedPackage.key
  )

  // Seed demo data (non-fatal)
  try {
    await seedDemoData(supabase, tenantId, data.businessName)
  } catch {
    /* non-fatal */
  }

  return { tenantId, userId, tenantSlug, planKey, enabledModules, lockedModules }
}

// ── Apply plan modules ────────────────────────────────────────────────────────

interface ApplyModulesArgs {
  tenantId: string
  selectedModules: ModuleKey[]
}

interface ApplyModulesResult {
  enabledModules: string[]
  lockedModules: string[]
}

export async function applyPlanModulesToTenant(
  args: ApplyModulesArgs
): Promise<ApplyModulesResult> {
  const supabase = getSupabaseServerClient() as any
  const { tenantId } = args
  const selected = new Set(normalizeSignupModuleSelection(args.selectedModules))

  const enabledModules: string[] = []
  const lockedModules: string[] = []

  const rows = (Object.keys(MODULE_REGISTRY) as ModuleKey[]).map((key) => {
    const isEnabled = selected.has(key)
    const isLocked = !isEnabled
    const lockedMsg = isLocked
      ? `Add ${MODULE_REGISTRY[key].label} to your subscription to enable it.`
      : null

    if (isEnabled) enabledModules.push(key)
    if (isLocked) lockedModules.push(key)

    return {
      tenant_id: tenantId,
      module_key: key,
      enabled: isEnabled,
      is_locked: isLocked,
      locked_reason: lockedMsg,
      source: 'subscription',
      config: {} as Json,
    }
  })

  // Upsert all module rows
  const { error } = await supabase
    .from('tenant_modules')
    .upsert(rows, { onConflict: 'tenant_id,module_key' })

  if (error) {
    console.error('[applyPlanModulesToTenant] upsert error:', error.message)
    throw new Error('Failed to enable your selected modules. Please try again.')
  }

  return { enabledModules, lockedModules }
}

// ── Create subscription ───────────────────────────────────────────────────────

interface CreateSubArgs {
  supabase: ReturnType<typeof getSupabaseServerClient>
  tenantId: string
  planKey: CRMPlanKey
  billingInterval: SignupBillingInterval
  selectedModules: ModuleKey[]
  selectedPackageKey: string
  quote: ReturnType<typeof calculateSignupQuote>
}

export async function createTenantSubscription({
  supabase,
  tenantId,
  planKey,
  billingInterval,
  selectedModules,
  selectedPackageKey,
  quote,
}: CreateSubArgs): Promise<void> {
  // Find the plan row
  const { data: plan } = await (supabase as any)
    .from('plans')
    .select('id')
    .eq('slug', planKey)
    .eq('is_active', true)
    .maybeSingle()

  const plan_id = plan?.id ?? null

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const subscription = {
    tenant_id: tenantId,
    plan_id,
    plan_key: planKey,
    status: 'trial',
    billing_interval: billingInterval,
    monthly_price_cents: quote.monthlyPriceCents,
    billing_amount_cents:
      billingInterval === 'yearly' ? quote.annualPriceCents : quote.monthlyPriceCents,
    selected_modules: selectedModules,
    package_key: selectedPackageKey,
    pricing_version: quote.pricingVersion,
    trial_ends_at: trialEndsAt,
    current_period_end: trialEndsAt,
    metadata: {
      pricing_model: 'module_subscription',
      base_price_cents: quote.basePriceCents,
      modules_price_cents: quote.modulesPriceCents,
      annual_savings_cents: quote.annualSavingsCents,
    },
  }

  const { data: existingSubscription } = await (supabase as any)
    .from('subscriptions')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const subscriptionWrite = existingSubscription?.id
    ? await (supabase as any)
        .from('subscriptions')
        .update(subscription)
        .eq('id', existingSubscription.id)
    : await (supabase as any).from('subscriptions').insert(subscription)

  if (subscriptionWrite.error) {
    throw new Error('Failed to save your subscription. Please try again.')
  }
}

// ── Save onboarding response ──────────────────────────────────────────────────

async function saveOnboardingResponse(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
  authUserId: string,
  data: OnboardingData,
  enabledModules: string[],
  lockedModules: string[],
  quote: ReturnType<typeof calculateSignupQuote>,
  selectedPackageKey: string
): Promise<void> {
  const rec: Record<string, unknown> = {
    tenant_id: tenantId,
    auth_user_id: authUserId,
    business_name: data.businessName,
    business_type: data.businessType,
    business_category: data.businessCategory,
    business_description: data.businessDescription,
    sells_products: data.sellsProducts,
    sells_services: data.sellsServices,
    needs_appointments: data.needsAppointments,
    needs_payments: data.needsPayments,
    needs_website: data.needsWebsite,
    needs_store: data.needsStore,
    needs_rewards: data.needsRewards,
    needs_staff_management: data.needsStaff,
    needs_customer_portal: data.needsCustomerPortal,
    needs_ai_builder: data.needsAiBuilder,
    needs_ai_images: data.needsAiImages,
    needs_360_products: data.needs360Products,
    needs_marketing_emails: data.needsEmailReminders,
    needs_analytics: data.needsAnalytics,
    employee_count: data.employeeCount,
    expected_monthly_customers: data.expectedMonthlyCustomers,
    expected_monthly_appointments: data.expectedMonthlyAppointments,
    expected_monthly_orders: data.expectedMonthlyOrders,
    monthly_budget_cents: data.monthlyBudgetCents,
    existing_website_url: data.existingWebsiteUrl,
    desired_subdomain: data.desiredSubdomain,
    selected_plan_key: data.selectedPlanKey,
    recommended_plan_key: data.recommendedPlanKey ?? data.selectedPlanKey,
    recommended_modules: data.recommendedModules ?? [],
    selected_modules: data.selectedModules ?? [],
    selected_package_key: selectedPackageKey,
    quoted_monthly_cents: quote.monthlyPriceCents,
    billing_interval: data.billingInterval ?? 'monthly',
    pricing_version: quote.pricingVersion,
    locked_modules: lockedModules,
    recommendation_reason: data.recommendationReason,
    completed_at: new Date().toISOString(),
    answers: {
      businessType: data.businessType,
      employeeCount: data.employeeCount,
    } as Json,
  }

  const { data: existingResponse } = await (supabase as any)
    .from('business_onboarding_responses')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const responseWrite = existingResponse?.id
    ? await (supabase as any)
        .from('business_onboarding_responses')
        .update(rec)
        .eq('id', existingResponse.id)
    : await (supabase as any).from('business_onboarding_responses').insert(rec)

  if (responseWrite.error) {
    throw new Error('Failed to save your onboarding selections. Please try again.')
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function resolveUniqueSlug(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  base: string
): Promise<string> {
  let slug = base
  for (let i = 0; i < 8; i++) {
    const { data } = await (supabase as any).from('tenants').select('id').eq('slug', slug).single()
    if (!data) return slug
    slug = `${base}-${Math.random().toString(36).slice(2, 5)}`
  }
  return `${base}-${Date.now().toString(36)}`
}

/** Minimal demo data seed (mirrors createTenantForUser) */
async function seedDemoData(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
  businessName: string
): Promise<void> {
  void businessName
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(10, 0, 0, 0)
  const { data: customers } = await (supabase as any)
    .from('customers')
    .insert([
      {
        tenant_id: tenantId,
        name: 'Alex Johnson',
        email: 'alex@example.com',
        phone: '(555) 100-0001',
        metadata: { source: 'demo' },
      },
      {
        tenant_id: tenantId,
        name: 'Maria Garcia',
        email: 'maria@example.com',
        phone: '(555) 100-0002',
        metadata: { source: 'demo' },
      },
    ])
    .select('id')

  const cid = customers?.[0]?.id ?? null
  if (cid) {
    await (supabase as any).from('appointments').insert([
      {
        tenant_id: tenantId,
        customer_id: cid,
        service_name: 'Welcome Consultation',
        starts_at: tomorrow.toISOString(),
        ends_at: new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString(),
        status: 'scheduled',
        notes: 'Demo appointment',
      },
    ])
  }
}
