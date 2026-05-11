/**
 * lib/plans/planCatalog.ts
 *
 * Single source of truth for CRM plan definitions, module assignments,
 * and business-type recommendation logic.
 *
 * Module keys used here MUST match the keys stored in public.tenant_modules.module_key
 * and the ModuleKey union in modules/shared/moduleTypes.ts.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CRMPlanKey = 'starter' | 'growth' | 'pro' | 'enterprise'

/** All module keys tracked by the plan system (superset of existing ModuleKey union) */
export type CRMModuleKey =
  | 'dashboard'
  | 'customers'
  | 'appointments'
  | 'payments'
  | 'rewards'
  | 'store'
  | 'website'
  | 'product_360'
  | 'damage_ai'
  | 'contacts'
  | 'leads'
  | 'messages'
  | 'vehicles'
  | 'staff'
  | 'customer_portal'
  | 'email_notifications'
  | 'analytics'
  | 'ai_website_builder'
  | 'ai_images'
  | 'settings'
  | 'owner_tools'

export interface PlanLimits {
  max_staff?:                   number | null
  max_customers?:               number | null
  max_products?:                number | null
  max_appointments_per_month?:  number | null
  max_ai_generations_per_month?: number | null
  max_360_packages?:            number | null
}

export interface PlanDefinition {
  key:                        CRMPlanKey
  name:                       string
  description:                string
  price_monthly_cents:        number
  price_yearly_cents:         number | null
  is_custom:                  boolean
  sort_order:                 number
  limits:                     PlanLimits
  included_modules:           CRMModuleKey[]
  highlight_features:         string[]
  includes_custom_domain:     boolean
  includes_white_label_email: boolean
  includes_ai_builder:        boolean
  includes_advanced_analytics: boolean
  badge?:                     string
}

export interface OnboardingAnswers {
  businessType?:                string
  businessCategory?:            string
  sellsProducts?:               boolean
  sellsServices?:               boolean
  needsAppointments?:           boolean
  needsPayments?:               boolean
  needsWebsite?:                boolean
  needsStore?:                  boolean
  needsRewards?:                boolean
  needsStaff?:                  boolean
  needsCustomerPortal?:         boolean
  needsEmailReminders?:         boolean
  needsAiBuilder?:              boolean
  needsAiImages?:               boolean
  needs360Products?:            boolean
  needsAnalytics?:              boolean
  employeeCount?:               number
  expectedMonthlyCustomers?:    number
  expectedMonthlyAppointments?: number
  expectedMonthlyOrders?:       number
  monthlyBudgetCents?:          number
}

export interface PlanRecommendation {
  recommended_plan_key:  CRMPlanKey
  recommended_modules:   CRMModuleKey[]
  locked_modules:        CRMModuleKey[]
  recommendation_reason: string
}

// ── Core modules always enabled regardless of plan ───────────────────────────
export const CORE_MODULES: CRMModuleKey[] = [
  'dashboard',
  'customers',
  'contacts',
  'leads',
  'settings',
]

// ── Plan catalog ─────────────────────────────────────────────────────────────

export const PLAN_CATALOG: Record<CRMPlanKey, PlanDefinition> = {
  starter: {
    key:                 'starter',
    name:                'Starter',
    description:         'Best for small service businesses getting started.',
    price_monthly_cents: 2900,
    price_yearly_cents:  27900,
    is_custom:           false,
    sort_order:          1,
    limits: {
      max_staff:                  3,
      max_customers:              200,
      max_products:               50,
      max_appointments_per_month: 100,
    },
    included_modules: [
      'dashboard', 'customers', 'contacts', 'leads',
      'appointments', 'website', 'settings',
    ],
    highlight_features: [
      'Customer management',
      'Appointment booking',
      'Basic website',
      'Up to 3 staff',
      '200 customers',
    ],
    includes_custom_domain:      false,
    includes_white_label_email:  false,
    includes_ai_builder:         false,
    includes_advanced_analytics: false,
  },

  growth: {
    key:                 'growth',
    name:                'Growth',
    description:         'Best for businesses that need online payments, website, and customer retention.',
    price_monthly_cents: 7900,
    price_yearly_cents:  75900,
    is_custom:           false,
    sort_order:          2,
    limits: {
      max_staff:                  10,
      max_customers:              1000,
      max_products:               200,
      max_appointments_per_month: 500,
    },
    included_modules: [
      'dashboard', 'customers', 'contacts', 'leads',
      'appointments', 'website', 'payments', 'rewards',
      'store', 'messages', 'staff', 'customer_portal',
      'email_notifications', 'settings',
    ],
    highlight_features: [
      'Everything in Starter',
      'Online payments',
      'Loyalty & rewards',
      'Online store',
      'Staff accounts (up to 10)',
      'Customer portal',
      'Email & SMS reminders',
    ],
    includes_custom_domain:      false,
    includes_white_label_email:  false,
    includes_ai_builder:         false,
    includes_advanced_analytics: false,
    badge:                       'Most Popular',
  },

  pro: {
    key:                 'pro',
    name:                'Pro',
    description:         'Best for scaling businesses that want advanced automation, AI tools, and 360 product studio.',
    price_monthly_cents: 14900,
    price_yearly_cents:  143900,
    is_custom:           false,
    sort_order:          3,
    limits: {
      max_staff:                   50,
      max_ai_generations_per_month: 100,
      max_360_packages:            20,
    },
    included_modules: [
      'dashboard', 'customers', 'contacts', 'leads',
      'appointments', 'website', 'payments', 'rewards',
      'store', 'messages', 'staff', 'customer_portal',
      'email_notifications', 'product_360', 'damage_ai',
      'vehicles', 'analytics', 'ai_website_builder', 'ai_images',
      'settings', 'owner_tools',
    ],
    highlight_features: [
      'Everything in Growth',
      'AI website builder',
      'AI image generation',
      '360 product studio',
      'Advanced analytics',
      'Custom domain',
      'White-label emails',
      'Unlimited staff',
    ],
    includes_custom_domain:      true,
    includes_white_label_email:  true,
    includes_ai_builder:         true,
    includes_advanced_analytics: true,
  },

  enterprise: {
    key:                 'enterprise',
    name:                'Enterprise',
    description:         'Best for multi-location businesses or custom workflows.',
    price_monthly_cents: 0,
    price_yearly_cents:  null,
    is_custom:           true,
    sort_order:          4,
    limits: {},
    included_modules: [
      'dashboard', 'customers', 'contacts', 'leads',
      'appointments', 'website', 'payments', 'rewards',
      'store', 'messages', 'staff', 'customer_portal',
      'email_notifications', 'product_360', 'damage_ai',
      'vehicles', 'analytics', 'ai_website_builder', 'ai_images',
      'settings', 'owner_tools',
    ],
    highlight_features: [
      'Everything in Pro',
      'Custom limits',
      'Priority support',
      'Custom integrations',
      'Multi-location support',
      'Dedicated onboarding',
    ],
    includes_custom_domain:      true,
    includes_white_label_email:  true,
    includes_ai_builder:         true,
    includes_advanced_analytics: true,
  },
}

// ── Module catalog (display metadata) ────────────────────────────────────────

export interface ModuleCatalogEntry {
  key:         CRMModuleKey
  label:       string
  description: string
  icon:        string
  isPremium:   boolean
  minPlan:     CRMPlanKey
}

export const MODULE_CATALOG: Record<CRMModuleKey, ModuleCatalogEntry> = {
  dashboard:            { key: 'dashboard',            label: 'Dashboard',          description: 'Business overview and KPIs',              icon: '📊', isPremium: false, minPlan: 'starter' },
  customers:            { key: 'customers',            label: 'Customers',          description: 'Customer management and profiles',        icon: '👥', isPremium: false, minPlan: 'starter' },
  contacts:             { key: 'contacts',             label: 'Contacts',           description: 'Contact management and lead tracking',    icon: '📇', isPremium: false, minPlan: 'starter' },
  leads:                { key: 'leads',                label: 'Leads',              description: 'Lead pipeline and conversion tracking',   icon: '🎯', isPremium: false, minPlan: 'starter' },
  appointments:         { key: 'appointments',         label: 'Appointments',       description: 'Online booking and scheduling',           icon: '📅', isPremium: false, minPlan: 'starter' },
  website:              { key: 'website',              label: 'Website Builder',    description: 'Build and publish your business website', icon: '🌐', isPremium: false, minPlan: 'starter' },
  settings:             { key: 'settings',             label: 'Settings',           description: 'Business settings and configuration',     icon: '⚙️', isPremium: false, minPlan: 'starter' },
  payments:             { key: 'payments',             label: 'Payments',           description: 'Accept payments via Stripe or Square',    icon: '💳', isPremium: false, minPlan: 'growth' },
  rewards:              { key: 'rewards',              label: 'Rewards & Loyalty',  description: 'Customer loyalty programs and points',    icon: '⭐', isPremium: false, minPlan: 'growth' },
  store:                { key: 'store',                label: 'Online Store',       description: 'Sell products and services online',       icon: '🛍️', isPremium: false, minPlan: 'growth' },
  messages:             { key: 'messages',             label: 'Messages',           description: 'Messaging center for customer comms',     icon: '💬', isPremium: false, minPlan: 'growth' },
  staff:                { key: 'staff',                label: 'Staff Management',   description: 'Staff accounts, roles, and scheduling',   icon: '👔', isPremium: false, minPlan: 'growth' },
  customer_portal:      { key: 'customer_portal',      label: 'Customer Portal',    description: 'Self-service portal for your customers',  icon: '🪪', isPremium: false, minPlan: 'growth' },
  email_notifications:  { key: 'email_notifications',  label: 'Email & SMS',        description: 'Automated email and SMS reminders',       icon: '📧', isPremium: false, minPlan: 'growth' },
  product_360:          { key: 'product_360',          label: '360 Product Studio', description: 'Interactive 360° product spin packages',  icon: '🔄', isPremium: true,  minPlan: 'pro'    },
  damage_ai:            { key: 'damage_ai',            label: 'AI Analysis',        description: 'AI-powered damage and image analysis',    icon: '🤖', isPremium: true,  minPlan: 'pro'    },
  vehicles:             { key: 'vehicles',             label: 'Vehicles',           description: 'Fleet and vehicle management',            icon: '🚗', isPremium: true,  minPlan: 'pro'    },
  analytics:            { key: 'analytics',            label: 'Advanced Analytics', description: 'Detailed reports and business insights',  icon: '📈', isPremium: true,  minPlan: 'pro'    },
  ai_website_builder:   { key: 'ai_website_builder',   label: 'AI Website Builder', description: 'Generate website pages with AI',          icon: '✨', isPremium: true,  minPlan: 'pro'    },
  ai_images:            { key: 'ai_images',            label: 'AI Image Studio',    description: 'Generate and enhance images with AI',     icon: '🎨', isPremium: true,  minPlan: 'pro'    },
  owner_tools:          { key: 'owner_tools',          label: 'Owner Tools',        description: 'Platform management tools',               icon: '🔧', isPremium: true,  minPlan: 'pro'    },
}

// ── Helper functions ──────────────────────────────────────────────────────────

export function getPlanByKey(key: CRMPlanKey): PlanDefinition {
  return PLAN_CATALOG[key]
}

export function getModulesForPlan(planKey: CRMPlanKey): CRMModuleKey[] {
  return PLAN_CATALOG[planKey].included_modules
}

export function isModuleIncludedInPlan(moduleKey: CRMModuleKey, planKey: CRMPlanKey): boolean {
  return PLAN_CATALOG[planKey].included_modules.includes(moduleKey)
}

export function getPlanLimits(planKey: CRMPlanKey): PlanLimits {
  return PLAN_CATALOG[planKey].limits
}

/** Returns modules that are NOT included in the given plan */
export function getLockedModulesForPlan(planKey: CRMPlanKey): CRMModuleKey[] {
  const included = new Set(PLAN_CATALOG[planKey].included_modules)
  return (Object.keys(MODULE_CATALOG) as CRMModuleKey[]).filter((k) => !included.has(k))
}

export function explainPlanRecommendation(planKey: CRMPlanKey, answers: OnboardingAnswers): string {
  const plan = PLAN_CATALOG[planKey]
  const reasons: string[] = []

  if (planKey === 'starter') {
    reasons.push('Your business is just getting started and needs core customer and appointment management.')
  } else if (planKey === 'growth') {
    if (answers.needsPayments) reasons.push('You need to accept online payments.')
    if (answers.needsRewards)  reasons.push('You want to run a loyalty/rewards program.')
    if (answers.needsStore)    reasons.push('You want to sell products online.')
    if ((answers.employeeCount ?? 0) > 3) reasons.push('You have more than 3 staff members.')
    if (reasons.length === 0)  reasons.push('Growth unlocks payments, rewards, and an online store for your business.')
  } else if (planKey === 'pro') {
    if (answers.needs360Products) reasons.push('You need the 360 Product Studio.')
    if (answers.needsAiBuilder)   reasons.push('You want the AI Website Builder.')
    if (answers.needsAiImages)    reasons.push('You want AI Image Generation.')
    if (answers.needsAnalytics)   reasons.push('You need advanced business analytics.')
    if ((answers.employeeCount ?? 0) > 10) reasons.push('You have more than 10 staff members.')
    if (reasons.length === 0)     reasons.push('Pro includes all AI tools, 360 product studio, and advanced analytics.')
  } else {
    reasons.push('Your business needs custom limits, multi-location support, or custom integrations.')
  }

  return `We recommend **${plan.name}** because: ${reasons.join(' ')}`
}

// ── Business type → module recommendations ────────────────────────────────────

const SERVICE_BUSINESS_TYPES = [
  'plumbing', 'hvac', 'heating', 'cooling', 'cleaning', 'auto repair',
  'mechanic', 'lawn care', 'landscaping', 'pest control', 'electrical',
  'handyman', 'construction', 'roofing', 'painting', 'moving',
]

const SALON_BUSINESS_TYPES = [
  'hair salon', 'barber', 'barbershop', 'nail salon', 'nails',
  'beauty salon', 'spa', 'massage', 'tattoo', 'tattoo shop',
  'esthetics', 'lashes', 'eyebrows', 'microblading',
]

const RESTAURANT_BUSINESS_TYPES = [
  'restaurant', 'food truck', 'cafe', 'coffee', 'bakery',
  'catering', 'bar', 'pub', 'bistro', 'diner',
]

const ECOMMERCE_BUSINESS_TYPES = [
  'ecommerce', 'e-commerce', 'online shop', 'online store',
  'dropshipping', 'retail', 'boutique',
]

const RENTAL_BUSINESS_TYPES = [
  'van rental', 'car rental', 'vehicle rental', 'equipment rental',
  'bike rental', 'scooter rental',
]

const HEALTH_BUSINESS_TYPES = [
  'medical', 'healthcare', 'clinic', 'dentist', 'dental',
  'chiropractor', 'physical therapy', 'therapy', 'counseling',
  'optometrist', 'veterinary', 'vet',
]

const FITNESS_BUSINESS_TYPES = [
  'gym', 'fitness', 'personal trainer', 'yoga', 'pilates',
  'crossfit', 'martial arts', 'dance studio', 'sports',
]

const CREATIVE_BUSINESS_TYPES = [
  'photography', 'photo studio', 'videography', 'graphic design',
  'event services', 'wedding planner', 'DJ', 'florist',
]

function matchesCategory(businessType: string, categories: string[]): boolean {
  const lower = businessType.toLowerCase()
  return categories.some((c) => lower.includes(c.toLowerCase()))
}

export function getRecommendedModulesFromAnswers(answers: OnboardingAnswers): CRMModuleKey[] {
  const modules = new Set<CRMModuleKey>(CORE_MODULES)
  const bt = answers.businessType?.toLowerCase() ?? ''

  // Always add appointments if needed or if service/salon/health/fitness business
  if (
    answers.needsAppointments ||
    matchesCategory(bt, SERVICE_BUSINESS_TYPES) ||
    matchesCategory(bt, SALON_BUSINESS_TYPES) ||
    matchesCategory(bt, HEALTH_BUSINESS_TYPES) ||
    matchesCategory(bt, FITNESS_BUSINESS_TYPES) ||
    matchesCategory(bt, RENTAL_BUSINESS_TYPES)
  ) {
    modules.add('appointments')
  }

  if (answers.needsPayments || matchesCategory(bt, [...RESTAURANT_BUSINESS_TYPES, ...ECOMMERCE_BUSINESS_TYPES, ...SALON_BUSINESS_TYPES])) {
    modules.add('payments')
  }

  if (answers.needsWebsite || bt.length > 0) {
    modules.add('website')
  }

  if (answers.needsStore || matchesCategory(bt, ECOMMERCE_BUSINESS_TYPES) || answers.sellsProducts) {
    modules.add('store')
    modules.add('payments')
  }

  if (answers.needsRewards || matchesCategory(bt, [...SALON_BUSINESS_TYPES, ...RESTAURANT_BUSINESS_TYPES])) {
    modules.add('rewards')
  }

  if (answers.needsStaff || (answers.employeeCount ?? 0) > 1) {
    modules.add('staff')
  }

  if (answers.needsCustomerPortal || matchesCategory(bt, [...HEALTH_BUSINESS_TYPES, ...FITNESS_BUSINESS_TYPES])) {
    modules.add('customer_portal')
  }

  if (answers.needsEmailReminders || modules.has('appointments')) {
    modules.add('email_notifications')
  }

  if (answers.needsAiBuilder) modules.add('ai_website_builder')
  if (answers.needsAiImages)  modules.add('ai_images')
  if (answers.needs360Products) {
    modules.add('product_360')
    modules.add('ai_images')
  }

  if (answers.needsAnalytics || (answers.expectedMonthlyCustomers ?? 0) > 500) {
    modules.add('analytics')
  }

  if (matchesCategory(bt, RENTAL_BUSINESS_TYPES)) {
    modules.add('vehicles')
  }

  modules.add('messages')

  return Array.from(modules)
}

export function getRecommendedPlanFromAnswers(answers: OnboardingAnswers): CRMPlanKey {
  // Enterprise signals
  const isEnterprise =
    (answers.employeeCount ?? 0) > 50 ||
    (answers.expectedMonthlyCustomers ?? 0) > 5000

  if (isEnterprise) return 'enterprise'

  // Pro signals
  const isPro =
    answers.needs360Products ||
    answers.needsAiBuilder ||
    answers.needsAiImages ||
    answers.needsAnalytics ||
    (answers.employeeCount ?? 0) > 10 ||
    (answers.expectedMonthlyCustomers ?? 0) > 1000 ||
    (answers.monthlyBudgetCents ?? 0) >= 14900

  if (isPro) return 'pro'

  // Growth signals
  const isGrowth =
    answers.needsPayments ||
    answers.needsRewards ||
    answers.needsStore ||
    answers.needsStaff ||
    answers.needsCustomerPortal ||
    (answers.employeeCount ?? 0) > 3 ||
    (answers.monthlyBudgetCents ?? 0) >= 7900

  if (isGrowth) return 'growth'

  return 'starter'
}

export function recommendBusinessPlan(answers: OnboardingAnswers): PlanRecommendation {
  const planKey         = getRecommendedPlanFromAnswers(answers)
  const recommendedMods = getRecommendedModulesFromAnswers(answers)
  const planModules     = new Set(getModulesForPlan(planKey))

  // Locked = modules the user WANTS but aren't in the selected plan
  const locked = recommendedMods.filter((m) => !planModules.has(m))

  return {
    recommended_plan_key:  planKey,
    recommended_modules:   recommendedMods,
    locked_modules:        locked,
    recommendation_reason: explainPlanRecommendation(planKey, answers),
  }
}

/** Formatted price string for display */
export function formatPlanPrice(planKey: CRMPlanKey, interval: 'monthly' | 'yearly' = 'monthly'): string {
  const plan = PLAN_CATALOG[planKey]
  if (plan.is_custom) return 'Custom'
  const cents = interval === 'yearly' ? (plan.price_yearly_cents ?? plan.price_monthly_cents * 12) : plan.price_monthly_cents
  return `$${Math.floor(cents / 100)}`
}
