import type { ModuleKey } from '@/modules/shared/moduleTypes'

export const SIGNUP_PRICING_VERSION = 'module-pricing-v1'
export const SIGNUP_BASE_PRICE_CENTS = 1_900
export const ANNUAL_DISCOUNT_PERCENT = 20

export type SignupBillingInterval = 'monthly' | 'yearly'
export type SignupModuleCategory = 'relationships' | 'operations' | 'commerce' | 'intelligence'

export type SignupModuleOffer = {
  key: ModuleKey
  name: string
  description: string
  monthlyPriceCents: number
  category: SignupModuleCategory
  workload: 'light' | 'standard' | 'advanced' | 'compute'
}

export type SignupPackagePreset = {
  key: string
  name: string
  description: string
  businessTypes: string[]
  modules: ModuleKey[]
}

export type SignupQuote = {
  billingInterval: SignupBillingInterval
  basePriceCents: number
  modulesPriceCents: number
  monthlyPriceCents: number
  annualPriceCents: number
  annualSavingsCents: number
  selectedModules: ModuleKey[]
  pricingVersion: string
}

export const SIGNUP_MODULE_OFFERS: SignupModuleOffer[] = [
  {
    key: 'contacts',
    name: 'Contacts',
    description: 'A shared address book for every customer and business relationship.',
    monthlyPriceCents: 500,
    category: 'relationships',
    workload: 'light',
  },
  {
    key: 'leads',
    name: 'Leads',
    description: 'Capture, qualify, and move opportunities through a focused pipeline.',
    monthlyPriceCents: 900,
    category: 'relationships',
    workload: 'standard',
  },
  {
    key: 'messages',
    name: 'Messages',
    description: 'Keep team and customer conversations connected to the work.',
    monthlyPriceCents: 900,
    category: 'relationships',
    workload: 'standard',
  },
  {
    key: 'customers',
    name: 'Customers',
    description: 'Customer profiles, history, preferences, and operational context.',
    monthlyPriceCents: 1_200,
    category: 'relationships',
    workload: 'standard',
  },
  {
    key: 'appointments',
    name: 'Appointments',
    description: 'Scheduling, availability, booking workflows, and reminders.',
    monthlyPriceCents: 1_500,
    category: 'operations',
    workload: 'standard',
  },
  {
    key: 'rewards',
    name: 'Rewards',
    description: 'Retention tools for loyalty, points, offers, and repeat visits.',
    monthlyPriceCents: 1_200,
    category: 'relationships',
    workload: 'standard',
  },
  {
    key: 'vehicles',
    name: 'Fleet',
    description: 'Vehicle profiles, availability, assignments, history, and utilization.',
    monthlyPriceCents: 2_900,
    category: 'operations',
    workload: 'advanced',
  },
  {
    key: 'maintenance',
    name: 'Fleet Maintenance',
    description: 'Service schedules, attention queues, repair records, and resolution tracking.',
    monthlyPriceCents: 1_900,
    category: 'operations',
    workload: 'advanced',
  },
  {
    key: 'inventory',
    name: 'Inventory',
    description: 'Stock levels, catalog operations, and inventory movement.',
    monthlyPriceCents: 1_900,
    category: 'operations',
    workload: 'advanced',
  },
  {
    key: 'payments',
    name: 'Payments',
    description: 'Payment collection and transaction visibility inside your workflows.',
    monthlyPriceCents: 1_500,
    category: 'commerce',
    workload: 'advanced',
  },
  {
    key: 'store',
    name: 'Online Store',
    description: 'Products, orders, and an integrated digital storefront.',
    monthlyPriceCents: 1_900,
    category: 'commerce',
    workload: 'advanced',
  },
  {
    key: 'pos',
    name: 'Point of Sale',
    description: 'Fast in-person checkout and connected counter operations.',
    monthlyPriceCents: 2_900,
    category: 'commerce',
    workload: 'advanced',
  },
  {
    key: 'website',
    name: 'Website',
    description: 'A managed web presence connected to your CRM data.',
    monthlyPriceCents: 1_900,
    category: 'commerce',
    workload: 'advanced',
  },
  {
    key: 'damage_ai',
    name: 'Van Damage AI',
    description: 'Image ingestion, AI damage scoring, review workflows, and fleet attribution.',
    monthlyPriceCents: 4_900,
    category: 'intelligence',
    workload: 'compute',
  },
  {
    key: 'product_360',
    name: 'Product 360°',
    description: 'Compute-intensive interactive product imagery and visual merchandising.',
    monthlyPriceCents: 3_900,
    category: 'intelligence',
    workload: 'compute',
  },
]

export const SIGNUP_MODULE_KEYS = SIGNUP_MODULE_OFFERS.map((module) => module.key) as ModuleKey[]

const VALID_MODULE_KEYS = new Set<string>(SIGNUP_MODULE_KEYS)

export const SIGNUP_PACKAGE_PRESETS: SignupPackagePreset[] = [
  {
    key: 'fleet-rental',
    name: 'Fleet & Rental Operations',
    description: 'A complete operating foundation for rental fleets and vehicle teams.',
    businessTypes: ['van rental', 'car rental', 'vehicle rental', 'fleet', 'transportation'],
    modules: ['vehicles', 'damage_ai', 'maintenance', 'customers', 'payments'],
  },
  {
    key: 'automotive-service',
    name: 'Automotive Service',
    description: 'Customer intake, scheduling, vehicle work, and payment collection.',
    businessTypes: ['auto repair', 'automotive', 'mechanic', 'body shop'],
    modules: ['customers', 'appointments', 'vehicles', 'maintenance', 'payments', 'messages'],
  },
  {
    key: 'salon-studio',
    name: 'Salon & Studio',
    description: 'Bookings, customer relationships, payments, and repeat-visit growth.',
    businessTypes: ['salon', 'barbershop', 'nail salon', 'tattoo', 'spa', 'beauty'],
    modules: ['appointments', 'customers', 'payments', 'rewards', 'messages'],
  },
  {
    key: 'hospitality-counter',
    name: 'Hospitality Counter',
    description: 'A practical front-of-house stack for food and hospitality businesses.',
    businessTypes: ['restaurant', 'food truck', 'cafe', 'coffee shop', 'hospitality'],
    modules: ['pos', 'payments', 'inventory', 'customers', 'rewards'],
  },
  {
    key: 'retail-commerce',
    name: 'Retail Commerce',
    description: 'Connected online and in-person selling with inventory and retention.',
    businessTypes: ['ecommerce', 'retail', 'online store', 'shop'],
    modules: ['store', 'payments', 'inventory', 'customers', 'rewards', 'website'],
  },
  {
    key: 'field-service',
    name: 'Field Service',
    description: 'Lead-to-job workflows for local service and trade businesses.',
    businessTypes: [
      'plumbing',
      'hvac',
      'electrical',
      'cleaning',
      'landscaping',
      'contractor',
      'home service',
    ],
    modules: ['leads', 'customers', 'appointments', 'payments', 'messages'],
  },
  {
    key: 'health-appointments',
    name: 'Health & Wellness',
    description: 'A streamlined customer, appointment, communication, and payment stack.',
    businessTypes: ['medical clinic', 'fitness', 'gym', 'wellness', 'therapy'],
    modules: ['customers', 'appointments', 'messages', 'payments'],
  },
  {
    key: 'real-estate-growth',
    name: 'Real Estate Growth',
    description: 'Relationship and lead management with a polished digital presence.',
    businessTypes: ['real estate', 'property management', 'realtor'],
    modules: ['contacts', 'leads', 'messages', 'website'],
  },
  {
    key: 'creative-services',
    name: 'Creative Services',
    description: 'Inquiry, booking, payment, and portfolio workflows for creative teams.',
    businessTypes: ['photography', 'event services', 'creative', 'agency'],
    modules: ['leads', 'appointments', 'payments', 'website', 'customers'],
  },
  {
    key: 'custom-foundation',
    name: 'Business Foundation',
    description: 'A flexible starting point you can tailor module by module.',
    businessTypes: ['other'],
    modules: ['customers', 'contacts', 'leads', 'messages'],
  },
]

const NEED_TO_MODULE: Record<string, ModuleKey | undefined> = {
  appointments: 'appointments',
  bookings: 'appointments',
  payments: 'payments',
  website: 'website',
  store: 'store',
  customers: 'customers',
  rewards: 'rewards',
  messages: 'messages',
  '360': 'product_360',
  product_360: 'product_360',
  vehicles: 'vehicles',
  fleet: 'vehicles',
  maintenance: 'maintenance',
  damage_ai: 'damage_ai',
  inventory: 'inventory',
  pos: 'pos',
  leads: 'leads',
  contacts: 'contacts',
}

export function normalizeSignupModuleSelection(value: unknown): ModuleKey[] {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value.filter((key): key is ModuleKey => typeof key === 'string' && VALID_MODULE_KEYS.has(key))
    )
  )
}

export function hasOnlyValidSignupModules(value: unknown): value is ModuleKey[] {
  return (
    Array.isArray(value) &&
    value.every((key) => typeof key === 'string' && VALID_MODULE_KEYS.has(key))
  )
}

export function getSignupPackageForBusinessType(businessType?: string | null): SignupPackagePreset {
  const normalized = (businessType || '').trim().toLowerCase()

  return (
    SIGNUP_PACKAGE_PRESETS.find((preset) =>
      preset.businessTypes.some((type) => normalized === type || normalized.includes(type))
    ) || SIGNUP_PACKAGE_PRESETS.find((preset) => preset.key === 'custom-foundation')!
  )
}

export function getRecommendedSignupModules(input: {
  businessType?: string | null
  needs?: unknown
  sellsProducts?: boolean | null
  offersServices?: boolean | null
}): ModuleKey[] {
  const preset = getSignupPackageForBusinessType(input.businessType)
  const modules = new Set<ModuleKey>(preset.modules)
  const needs = Array.isArray(input.needs) ? input.needs : []

  for (const need of needs) {
    if (typeof need !== 'string') continue
    const mapped = NEED_TO_MODULE[need.trim().toLowerCase()]
    if (mapped) modules.add(mapped)
  }

  if (input.sellsProducts) {
    modules.add('store')
    modules.add('inventory')
    modules.add('payments')
  }

  if (input.offersServices) {
    modules.add('appointments')
    modules.add('customers')
  }

  return Array.from(modules)
}

export function getRequiredModuleKeys(moduleKey: ModuleKey): ModuleKey[] {
  if (moduleKey === 'damage_ai' || moduleKey === 'maintenance') {
    return ['vehicles']
  }
  return []
}

export function addSignupModuleWithDependencies(
  selectedModules: ModuleKey[],
  moduleKey: ModuleKey
): ModuleKey[] {
  return normalizeSignupModuleSelection([
    ...selectedModules,
    ...getRequiredModuleKeys(moduleKey),
    moduleKey,
  ])
}

export function removeSignupModuleWithDependents(
  selectedModules: ModuleKey[],
  moduleKey: ModuleKey
): ModuleKey[] {
  const dependents =
    moduleKey === 'vehicles' ? new Set<ModuleKey>(['damage_ai', 'maintenance']) : null

  return selectedModules.filter((key) => key !== moduleKey && !dependents?.has(key))
}

export function calculateSignupQuote(
  selectedModules: unknown,
  billingInterval: SignupBillingInterval = 'monthly'
): SignupQuote {
  const normalizedModules = normalizeSignupModuleSelection(selectedModules)
  const modulesPriceCents = normalizedModules.reduce((total, moduleKey) => {
    const offer = SIGNUP_MODULE_OFFERS.find((candidate) => candidate.key === moduleKey)
    return total + (offer?.monthlyPriceCents || 0)
  }, 0)
  const undiscountedMonthly = SIGNUP_BASE_PRICE_CENTS + modulesPriceCents
  const annualUndiscounted = undiscountedMonthly * 12
  const annualPriceCents = Math.round(annualUndiscounted * (1 - ANNUAL_DISCOUNT_PERCENT / 100))

  return {
    billingInterval,
    basePriceCents: SIGNUP_BASE_PRICE_CENTS,
    modulesPriceCents,
    monthlyPriceCents:
      billingInterval === 'yearly' ? Math.round(annualPriceCents / 12) : undiscountedMonthly,
    annualPriceCents: billingInterval === 'yearly' ? annualPriceCents : annualUndiscounted,
    annualSavingsCents: billingInterval === 'yearly' ? annualUndiscounted - annualPriceCents : 0,
    selectedModules: normalizedModules,
    pricingVersion: SIGNUP_PRICING_VERSION,
  }
}

export function derivePlanKeyFromModules(selectedModules: unknown): 'starter' | 'growth' | 'pro' {
  const selected = new Set(normalizeSignupModuleSelection(selectedModules))
  const hasComputeModule = selected.has('damage_ai') || selected.has('product_360')
  const hasAdvancedOperations =
    selected.has('vehicles') ||
    selected.has('maintenance') ||
    selected.has('pos') ||
    selected.has('inventory')

  if (hasComputeModule || selected.size >= 8) return 'pro'
  if (hasAdvancedOperations || selected.size >= 4) return 'growth'
  return 'starter'
}

export function formatSignupPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}
