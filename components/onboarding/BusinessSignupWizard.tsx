'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { signupSchema, slugifyBusinessName } from '@/lib/validation/auth'
import { PlanComparisonCards } from '@/components/plans/PlanComparisonCards'
import { cn } from '@/lib/utils'
import type { CRMPlanKey, CRMModuleKey } from '@/lib/plans/planCatalog'
import { MODULE_CATALOG, PLAN_CATALOG } from '@/lib/plans/planCatalog'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WizardState {
  // Step 1: Account
  email:           string
  password:        string
  confirmPassword: string
  fullName:        string

  // Step 2: Business basics
  businessName:       string
  businessCategory:   string
  businessDescription: string
  phone:              string
  address:            string
  existingWebsiteUrl: string
  desiredSubdomain:   string

  // Step 3: What do you do?
  businessType:  string
  sellsProducts: boolean
  sellsServices: boolean

  // Step 4: What do you need?
  needsAppointments:   boolean
  needsPayments:       boolean
  needsWebsite:        boolean
  needsStore:          boolean
  needsCustomers:      boolean
  needsRewards:        boolean
  needsStaff:          boolean
  needsCustomerPortal: boolean
  needsEmailReminders: boolean
  needsAiBuilder:      boolean
  needsAiImages:       boolean
  needs360Products:    boolean
  needsAnalytics:      boolean

  // Step 5: Business size
  employeeCount:               string
  expectedMonthlyCustomers:    string
  expectedMonthlyAppointments: string
  expectedMonthlyOrders:       string
  monthlyBudgetCents:          string

  // Step 6: Plan
  recommendedPlanKey:  CRMPlanKey | null
  selectedPlanKey:     CRMPlanKey
  recommendationReason: string
  recommendedModules:  CRMModuleKey[]
  plans:               PlanCard[]
  billingInterval:     'monthly' | 'yearly'
}

interface PlanCard {
  key:                         CRMPlanKey
  name:                        string
  description:                 string
  price_monthly_cents:         number
  price_yearly_cents:          number | null
  is_custom:                   boolean
  badge?:                      string
  is_recommended:              boolean
  included_modules:            CRMModuleKey[]
  highlight_features:          string[]
  limits:                      Record<string, number | null | undefined>
  includes_custom_domain:      boolean
  includes_white_label_email:  boolean
  includes_ai_builder:         boolean
  includes_advanced_analytics: boolean
}

// ── Business categories ───────────────────────────────────────────────────────

const BUSINESS_CATEGORIES = [
  { key: 'plumbing',       label: 'Plumbing',        icon: '🔧' },
  { key: 'hvac',           label: 'HVAC',             icon: '❄️' },
  { key: 'hair salon',     label: 'Hair Salon',       icon: '✂️' },
  { key: 'barber',         label: 'Barbershop',       icon: '💈' },
  { key: 'nail salon',     label: 'Nail Salon',       icon: '💅' },
  { key: 'restaurant',     label: 'Restaurant',       icon: '🍽️' },
  { key: 'food truck',     label: 'Food Truck',       icon: '🚚' },
  { key: 'auto repair',    label: 'Auto Repair',      icon: '🔩' },
  { key: 'van rental',     label: 'Van/Car Rental',   icon: '🚐' },
  { key: 'cleaning',       label: 'Cleaning Service', icon: '🧹' },
  { key: 'ecommerce',      label: 'Ecommerce Shop',   icon: '🛍️' },
  { key: 'medical',        label: 'Medical/Healthcare', icon: '🏥' },
  { key: 'real estate',    label: 'Real Estate',      icon: '🏠' },
  { key: 'fitness',        label: 'Fitness/Gym',      icon: '💪' },
  { key: 'tattoo shop',    label: 'Tattoo Shop',      icon: '🖊️' },
  { key: 'photography',    label: 'Photography',      icon: '📷' },
  { key: 'event services', label: 'Event Services',   icon: '🎉' },
  { key: 'other',          label: 'Other',            icon: '🏪' },
]

const BUDGET_OPTIONS = [
  { label: 'Under $30/mo',   value: '2500' },
  { label: '$30–$80/mo',     value: '5000' },
  { label: '$80–$150/mo',    value: '10000' },
  { label: '$150–$500/mo',   value: '30000' },
  { label: '$500+/mo',       value: '60000' },
  { label: "I'm not sure",   value: '0' },
]

const EMPLOYEE_OPTIONS = [
  { label: 'Just me',  value: '1' },
  { label: '2–3',      value: '2' },
  { label: '4–10',     value: '5' },
  { label: '11–25',    value: '15' },
  { label: '26–50',    value: '35' },
  { label: '50+',      value: '75' },
]

// ── Initial state ─────────────────────────────────────────────────────────────

const INITIAL: WizardState = {
  email: '', password: '', confirmPassword: '', fullName: '',
  businessName: '', businessCategory: '', businessDescription: '',
  phone: '', address: '', existingWebsiteUrl: '', desiredSubdomain: '',
  businessType: '', sellsProducts: false, sellsServices: true,
  needsAppointments: false, needsPayments: false, needsWebsite: true,
  needsStore: false, needsCustomers: true, needsRewards: false,
  needsStaff: false, needsCustomerPortal: false, needsEmailReminders: false,
  needsAiBuilder: false, needsAiImages: false, needs360Products: false, needsAnalytics: false,
  employeeCount: '1', expectedMonthlyCustomers: '', expectedMonthlyAppointments: '',
  expectedMonthlyOrders: '', monthlyBudgetCents: '0',
  recommendedPlanKey: null, selectedPlanKey: 'starter',
  recommendationReason: '', recommendedModules: [], plans: [],
  billingInterval: 'monthly',
}

const TOTAL_STEPS = 7

// ── Main component ────────────────────────────────────────────────────────────

export function BusinessSignupWizard() {
  const [step,      setStep]      = useState(1)
  const [state,     setState]     = useState<WizardState>(INITIAL)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const update = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }))
  }, [])

  // Auto-derive subdomain from business name
  const subdomainPreview = state.desiredSubdomain.trim() || slugifyBusinessName(state.businessName)

  // ── Step navigation ─────────────────────────────────────────────────────────

  function validateStep(): string | null {
    if (step === 1) {
      if (!state.email.trim())           return 'Email is required.'
      if (!state.email.includes('@'))    return 'Enter a valid email address.'
      if (state.password.length < 8)     return 'Password must be at least 8 characters.'
      if (!/[A-Z]/.test(state.password)) return 'Password must include at least one uppercase letter.'
      if (!/[0-9]/.test(state.password)) return 'Password must include at least one number.'
      if (state.password !== state.confirmPassword) return 'Passwords do not match.'
    }
    if (step === 2) {
      if (!state.businessName.trim()) return 'Business name is required.'
      if (!state.businessCategory)    return 'Please select a business type.'
    }
    return null
  }

  async function handleNext() {
    setError(null)
    const err = validateStep()
    if (err) { setError(err); return }

    // Step 5 → 6: fetch recommendations
    if (step === 5) {
      await fetchRecommendation()
      return
    }

    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  }

  function handleBack() {
    setError(null)
    setStep((s) => Math.max(s - 1, 1))
  }

  // ── Fetch recommendation ────────────────────────────────────────────────────

  async function fetchRecommendation() {
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/business/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessType:               state.businessCategory,
          businessCategory:           state.businessCategory,
          sellsProducts:              state.sellsProducts,
          sellsServices:              state.sellsServices,
          needsAppointments:          state.needsAppointments,
          needsPayments:              state.needsPayments,
          needsWebsite:               state.needsWebsite,
          needsStore:                 state.needsStore,
          needsRewards:               state.needsRewards,
          needsStaff:                 state.needsStaff,
          needsCustomerPortal:        state.needsCustomerPortal,
          needsEmailReminders:        state.needsEmailReminders,
          needsAiBuilder:             state.needsAiBuilder,
          needsAiImages:              state.needsAiImages,
          needs360Products:           state.needs360Products,
          needsAnalytics:             state.needsAnalytics,
          employeeCount:              parseInt(state.employeeCount) || 1,
          expectedMonthlyCustomers:   parseInt(state.expectedMonthlyCustomers) || 0,
          expectedMonthlyAppointments: parseInt(state.expectedMonthlyAppointments) || 0,
          expectedMonthlyOrders:      parseInt(state.expectedMonthlyOrders) || 0,
          monthlyBudgetCents:         parseInt(state.monthlyBudgetCents) || 0,
        }),
      })
      const data = await res.json()
      if (data.success) {
        update({
          recommendedPlanKey:   data.recommended.recommended_plan_key,
          selectedPlanKey:      data.recommended.recommended_plan_key,
          recommendationReason: data.recommended.recommendation_reason,
          recommendedModules:   data.recommended.recommended_modules,
          plans:                data.plans,
        })
        setStep(6)
      } else {
        setError('Failed to load plan recommendations. Please try again.')
      }
    } catch {
      setError('Network error loading recommendations. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setError(null)
    setLoading(true)

    const supabase = getSupabaseBrowserClient()

    // Step 1: Create auth user
    // emailRedirectTo must point to the main CRM domain (nexoranow.com) because
    // CRM admin signup always happens on the root domain. We use NEXT_PUBLIC_APP_URL
    // so this works in Vercel preview environments too.
    const crmAppUrl = (process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin).replace(/\/$/, '')
    const emailRedirectTo = `${crmAppUrl}/auth/callback?next=${encodeURIComponent('/dashboard')}`

    const { data: authData, error: signUpErr } = await supabase.auth.signUp({
      email:    state.email,
      password: state.password,
      options: {
        data: {
          role:         'admin',
          businessName: state.businessName,
          full_name:    state.fullName,
        },
        emailRedirectTo,
      },
    })

    if (signUpErr) {
      setError(
        signUpErr.message.toLowerCase().includes('already registered')
          ? 'An account with this email already exists. Try signing in instead.'
          : signUpErr.message
      )
      setLoading(false)
      return
    }

    if (!authData.user) {
      setError('Signup failed. Please try again.')
      setLoading(false)
      return
    }

    // If no session (email confirmation required), show check email screen
    if (!authData.session) {
      setEmailSent(true)
      setLoading(false)
      return
    }

    // Step 2: Complete onboarding on the server
    try {
      const res = await fetch('/api/onboarding/business/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:                      state.email,
          businessName:               state.businessName,
          businessType:               state.businessCategory,
          businessCategory:           state.businessCategory,
          businessDescription:        state.businessDescription,
          phone:                      state.phone,
          address:                    state.address,
          existingWebsiteUrl:         state.existingWebsiteUrl,
          desiredSubdomain:           state.desiredSubdomain || subdomainPreview,
          sellsProducts:              state.sellsProducts,
          sellsServices:              state.sellsServices,
          needsAppointments:          state.needsAppointments,
          needsPayments:              state.needsPayments,
          needsWebsite:               state.needsWebsite,
          needsStore:                 state.needsStore,
          needsRewards:               state.needsRewards,
          needsStaff:                 state.needsStaff,
          needsCustomerPortal:        state.needsCustomerPortal,
          needsEmailReminders:        state.needsEmailReminders,
          needsAiBuilder:             state.needsAiBuilder,
          needsAiImages:              state.needsAiImages,
          needs360Products:           state.needs360Products,
          needsAnalytics:             state.needsAnalytics,
          employeeCount:              parseInt(state.employeeCount) || 1,
          expectedMonthlyCustomers:   parseInt(state.expectedMonthlyCustomers) || 0,
          expectedMonthlyAppointments: parseInt(state.expectedMonthlyAppointments) || 0,
          expectedMonthlyOrders:      parseInt(state.expectedMonthlyOrders) || 0,
          monthlyBudgetCents:         parseInt(state.monthlyBudgetCents) || 0,
          selectedPlanKey:            state.selectedPlanKey,
          recommendedPlanKey:         state.recommendedPlanKey,
          recommendedModules:         state.recommendedModules,
          recommendationReason:       state.recommendationReason,
        }),
      })

      const result = await res.json()
      if (!result.success) {
        setError(result.error ?? 'Failed to set up your workspace. Please try again.')
        setLoading(false)
        return
      }

      window.location.href = result.redirectUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up your workspace.')
      setLoading(false)
    }
  }

  // ── Email sent screen ───────────────────────────────────────────────────────

  if (emailSent) {
    return (
      <div className="min-h-dvh bg-graphite-950 flex items-center justify-center px-6 py-12">
        <div className="glass-surface premium-border noise-overlay p-8 shadow-panel-lg text-center max-w-md w-full">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-gold-gradient items-center justify-center mb-5 shadow-glow-gold">
            <span className="text-2xl">✉</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
          <p className="text-sm text-white/50 mb-6 leading-relaxed">
            We sent a confirmation link to{' '}
            <span className="text-white/80 font-medium">{state.email}</span>.
            Click the link to activate your account and access your dashboard.
          </p>
          <p className="text-xs text-white/25">
            Already confirmed?{' '}
            <Link href="/login" className="text-gold-400 hover:text-gold-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-graphite-950 flex flex-col">
      {/* Header */}
      <div className="px-6 pt-8 pb-4 text-center">
        <div className="inline-flex h-10 w-10 rounded-xl bg-gold-gradient items-center justify-center mb-3 shadow-glow-gold">
          <span className="text-graphite-900 font-bold text-base">A</span>
        </div>
        <h1 className="text-xl font-bold text-white">Create your workspace</h1>
        <p className="text-sm text-white/40 mt-1">Free 14-day trial — no credit card required</p>
      </div>

      {/* Progress bar */}
      <div className="px-6 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-white/30">Step {step} of {TOTAL_STEPS}</span>
          <span className="text-xs text-white/20 ml-auto">{STEP_LABELS[step - 1]}</span>
        </div>
        <div className="h-1.5 w-full bg-graphite-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gold-gradient rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          {step === 1 && <Step1Account state={state} update={update} />}
          {step === 2 && <Step2BusinessBasics state={state} update={update} subdomainPreview={subdomainPreview} />}
          {step === 3 && <Step3WhatYouDo state={state} update={update} />}
          {step === 4 && <Step4WhatYouNeed state={state} update={update} />}
          {step === 5 && <Step5BusinessSize state={state} update={update} />}
          {step === 6 && <Step6PlanSelection state={state} update={update} />}
          {step === 7 && <Step7Confirm state={state} subdomainPreview={subdomainPreview} />}

          {/* Error */}
          {error && (
            <div className="mt-4 flex items-start gap-2.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="flex-1 h-11 rounded-xl border border-graphite-600 text-white/60 text-sm font-medium hover:bg-graphite-800 hover:text-white transition-colors disabled:opacity-50"
              >
                Back
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={loading}
                className="flex-1 h-11 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-graphite-700 border-t-transparent rounded-full animate-spin" />
                    Loading…
                  </>
                ) : (
                  step === 5 ? 'See Recommended Plans' : 'Continue'
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 h-11 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-graphite-700 border-t-transparent rounded-full animate-spin" />
                    Creating workspace…
                  </>
                ) : (
                  'Create My Workspace'
                )}
              </button>
            )}
          </div>

          {step === 1 && (
            <p className="text-center text-xs text-white/25 mt-4">
              Already have an account?{' '}
              <Link href="/login" className="text-gold-400 hover:text-gold-300 transition-colors">
                Sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step labels ───────────────────────────────────────────────────────────────

const STEP_LABELS = [
  'Account', 'Business Info', 'What You Do', 'What You Need',
  'Business Size', 'Choose Plan', 'Confirm',
]

// ── Step components ───────────────────────────────────────────────────────────

function Field({
  id, label, type = 'text', value, onChange, placeholder, hint, disabled, required,
}: {
  id: string; label: string; type?: string; value: string
  onChange: (v: string) => void; placeholder?: string; hint?: string
  disabled?: boolean; required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-white/50 uppercase tracking-wider">
        {label}{required && <span className="text-gold-400 ml-1">*</span>}
      </label>
      <input
        id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)}
        disabled={disabled} placeholder={placeholder}
        className="w-full h-11 px-4 rounded-xl bg-graphite-800 border border-graphite-600 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-gold-500/50 transition-colors disabled:opacity-50"
      />
      {hint && <p className="text-xs text-white/30">{hint}</p>}
    </div>
  )
}

function Step1Account({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Create your account</h2>
        <p className="text-sm text-white/40 mt-1">Start with your login details.</p>
      </div>
      <Field id="email" label="Work email" type="email" value={state.email}
        onChange={(v) => update({ email: v })} placeholder="you@yourbusiness.com" required />
      <Field id="fullName" label="Full name" value={state.fullName}
        onChange={(v) => update({ fullName: v })} placeholder="Alex Johnson" />
      <Field id="password" label="Password" type="password" value={state.password}
        onChange={(v) => update({ password: v })} placeholder="Min 8 chars, 1 uppercase, 1 number"
        hint="At least 8 characters with one uppercase letter and one number." required />
      <Field id="confirmPassword" label="Confirm password" type="password" value={state.confirmPassword}
        onChange={(v) => update({ confirmPassword: v })} placeholder="••••••••" required />
    </div>
  )
}

function Step2BusinessBasics({
  state, update, subdomainPreview,
}: {
  state: WizardState; update: (p: Partial<WizardState>) => void; subdomainPreview: string
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Tell us about your business</h2>
        <p className="text-sm text-white/40 mt-1">This helps us personalize your workspace.</p>
      </div>

      <Field id="businessName" label="Business name" value={state.businessName}
        onChange={(v) => update({ businessName: v })} placeholder="Apex Auto Group" required />

      {/* Business category */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-white/50 uppercase tracking-wider">
          Business type <span className="text-gold-400">*</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {BUSINESS_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => update({ businessCategory: cat.key, businessType: cat.key })}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border py-3 px-2 text-center transition-all',
                state.businessCategory === cat.key
                  ? 'border-gold-500/70 bg-gold-500/10 text-white'
                  : 'border-graphite-600 bg-graphite-800/50 text-white/50 hover:border-graphite-500 hover:text-white/80'
              )}
            >
              <span className="text-xl">{cat.icon}</span>
              <span className="text-[11px] font-medium leading-tight">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Field id="phone" label="Business phone" type="tel" value={state.phone}
        onChange={(v) => update({ phone: v })} placeholder="(555) 000-0000" />

      {/* Subdomain */}
      <div className="space-y-1.5">
        <label htmlFor="subdomain" className="block text-xs font-medium text-white/50 uppercase tracking-wider">
          Workspace URL <span className="text-white/25 font-normal normal-case">(optional)</span>
        </label>
        <div className="flex items-center overflow-hidden rounded-xl border border-graphite-600 bg-graphite-800 focus-within:border-gold-500/50 transition-colors">
          <span className="shrink-0 px-3 text-xs text-white/30 border-r border-graphite-600">crm.app/</span>
          <input
            id="subdomain" type="text" value={state.desiredSubdomain}
            onChange={(e) => update({ desiredSubdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
            placeholder={subdomainPreview || 'my-business'}
            className="flex-1 h-11 px-3 bg-transparent text-white text-sm placeholder:text-white/20 focus:outline-none"
          />
        </div>
        {subdomainPreview && (
          <p className="text-xs text-white/30">Your workspace: <span className="font-mono text-white/50">{subdomainPreview}</span></p>
        )}
      </div>

      <Field id="existingWebsite" label="Existing website URL" value={state.existingWebsiteUrl}
        onChange={(v) => update({ existingWebsiteUrl: v })} placeholder="https://mybusiness.com"
        hint="Optional — we can help you migrate or integrate." />
    </div>
  )
}

function Step3WhatYouDo({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">What does your business do?</h2>
        <p className="text-sm text-white/40 mt-1">Help us understand your business model.</p>
      </div>

      {/* Products vs Services */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Do you sell products, services, or both?</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Services only', icon: '🛠️', p: false, s: true },
            { label: 'Products only', icon: '📦', p: true,  s: false },
            { label: 'Both',          icon: '🔀', p: true,  s: true },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => update({ sellsProducts: opt.p, sellsServices: opt.s })}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border py-4 px-3 transition-all text-center',
                state.sellsProducts === opt.p && state.sellsServices === opt.s
                  ? 'border-gold-500/70 bg-gold-500/10 text-white'
                  : 'border-graphite-600 bg-graphite-800/50 text-white/50 hover:border-graphite-500 hover:text-white/80'
              )}
            >
              <span className="text-2xl">{opt.icon}</span>
              <span className="text-xs font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Optional description */}
      <div className="space-y-1.5">
        <label htmlFor="desc" className="block text-xs font-medium text-white/50 uppercase tracking-wider">
          Describe your business <span className="text-white/25 font-normal normal-case">(optional)</span>
        </label>
        <textarea
          id="desc" value={state.businessDescription} rows={3}
          onChange={(e) => update({ businessDescription: e.target.value })}
          placeholder="e.g. We're a family-owned hair salon specializing in color and cuts…"
          className="w-full px-4 py-3 rounded-xl bg-graphite-800 border border-graphite-600 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-gold-500/50 transition-colors resize-none"
        />
      </div>
    </div>
  )
}

const NEEDS_OPTIONS: Array<{
  key: keyof Pick<WizardState,
    'needsAppointments' | 'needsPayments' | 'needsWebsite' | 'needsStore' | 'needsCustomers' |
    'needsRewards' | 'needsStaff' | 'needsCustomerPortal' | 'needsEmailReminders' |
    'needsAiBuilder' | 'needsAiImages' | 'needs360Products' | 'needsAnalytics'>
  label: string
  icon: string
  description: string
  isPremium?: boolean
}> = [
  { key: 'needsAppointments',   label: 'Appointments',       icon: '📅', description: 'Online booking & scheduling' },
  { key: 'needsPayments',       label: 'Accept Payments',    icon: '💳', description: 'Stripe or Square integration' },
  { key: 'needsWebsite',        label: 'Website',            icon: '🌐', description: 'Build & publish your site' },
  { key: 'needsStore',          label: 'Online Store',       icon: '🛍️', description: 'Sell products online' },
  { key: 'needsCustomers',      label: 'Customer Mgmt',      icon: '👥', description: 'Customer profiles & history' },
  { key: 'needsRewards',        label: 'Rewards/Loyalty',    icon: '⭐', description: 'Points & loyalty programs' },
  { key: 'needsStaff',          label: 'Staff Accounts',     icon: '👔', description: 'Employees & professionals' },
  { key: 'needsCustomerPortal', label: 'Customer Portal',    icon: '🪪', description: 'Self-service for clients' },
  { key: 'needsEmailReminders', label: 'Email & SMS',        icon: '📧', description: 'Automated reminders' },
  { key: 'needsAiBuilder',      label: 'AI Website Builder', icon: '✨', description: 'Generate pages with AI', isPremium: true },
  { key: 'needsAiImages',       label: 'AI Images',          icon: '🎨', description: 'AI-generated images', isPremium: true },
  { key: 'needs360Products',    label: '360 Product Studio', icon: '🔄', description: 'Interactive product spins', isPremium: true },
  { key: 'needsAnalytics',      label: 'Analytics',          icon: '📈', description: 'Advanced business insights', isPremium: true },
]

function Step4WhatYouNeed({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">What do you need Nexora to help with?</h2>
        <p className="text-sm text-white/40 mt-1">Select all that apply. We'll recommend the right plan.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {NEEDS_OPTIONS.map((opt) => {
          const selected = state[opt.key] as boolean
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => update({ [opt.key]: !selected } as Partial<WizardState>)}
              className={cn(
                'relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all',
                selected
                  ? 'border-gold-500/70 bg-gold-500/10'
                  : 'border-graphite-600 bg-graphite-800/50 hover:border-graphite-500'
              )}
            >
              {opt.isPremium && (
                <span className="absolute top-2 right-2 text-[10px] text-purple-400 font-medium">Pro</span>
              )}
              <span className="text-lg">{opt.icon}</span>
              <span className={cn('text-xs font-semibold', selected ? 'text-white' : 'text-white/70')}>
                {opt.label}
              </span>
              <span className="text-[11px] text-white/35 leading-tight">{opt.description}</span>
              {selected && (
                <div className="absolute top-2 left-2 h-4 w-4 rounded-full bg-gold-500 flex items-center justify-center">
                  <svg className="h-2.5 w-2.5 text-graphite-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Step5BusinessSize({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">A bit about your business size</h2>
        <p className="text-sm text-white/40 mt-1">This helps us recommend the right plan and limits.</p>
      </div>

      {/* Employee count */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wider">How many employees / staff do you have?</p>
        <div className="flex flex-wrap gap-2">
          {EMPLOYEE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ employeeCount: opt.value })}
              className={cn(
                'rounded-xl border px-4 py-2 text-sm font-medium transition-all',
                state.employeeCount === opt.value
                  ? 'border-gold-500/70 bg-gold-500/10 text-white'
                  : 'border-graphite-600 bg-graphite-800/50 text-white/50 hover:border-graphite-500 hover:text-white/80'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Monthly customers */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wider">
          How many monthly customers do you expect?
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Under 50',  value: '25' },
            { label: '50–200',    value: '100' },
            { label: '200–500',   value: '350' },
            { label: '500–1,000', value: '750' },
            { label: '1,000+',    value: '1500' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ expectedMonthlyCustomers: opt.value })}
              className={cn(
                'rounded-xl border px-4 py-2 text-sm font-medium transition-all',
                state.expectedMonthlyCustomers === opt.value
                  ? 'border-gold-500/70 bg-gold-500/10 text-white'
                  : 'border-graphite-600 bg-graphite-800/50 text-white/50 hover:border-graphite-500 hover:text-white/80'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Monthly budget */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Monthly software budget</p>
        <div className="flex flex-wrap gap-2">
          {BUDGET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ monthlyBudgetCents: opt.value })}
              className={cn(
                'rounded-xl border px-4 py-2 text-sm font-medium transition-all',
                state.monthlyBudgetCents === opt.value
                  ? 'border-gold-500/70 bg-gold-500/10 text-white'
                  : 'border-graphite-600 bg-graphite-800/50 text-white/50 hover:border-graphite-500 hover:text-white/80'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Step6PlanSelection({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const plan = PLAN_CATALOG[state.selectedPlanKey]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Choose your plan</h2>
        {state.recommendationReason && (
          <div className="mt-2 rounded-xl bg-graphite-800/70 border border-graphite-600 px-4 py-3">
            <p className="text-xs text-white/60 leading-relaxed">
              <span className="text-gold-400 font-medium">Our recommendation: </span>
              {state.recommendationReason.replace(/\*\*/g, '')}
            </p>
          </div>
        )}
      </div>

      <PlanComparisonCards
        plans={state.plans}
        selectedPlanKey={state.selectedPlanKey}
        onSelectPlan={(key) => update({ selectedPlanKey: key })}
        billingInterval={state.billingInterval}
        onToggleBilling={() => update({ billingInterval: state.billingInterval === 'monthly' ? 'yearly' : 'monthly' })}
        highlightKey={state.recommendedPlanKey ?? undefined}
      />

      {state.selectedPlanKey === 'enterprise' && (
        <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 px-4 py-3">
          <p className="text-sm text-blue-300 font-medium mb-1">Enterprise — Custom Setup</p>
          <p className="text-xs text-white/50 leading-relaxed">
            Your account will be created with core modules enabled. Our team will contact you within 24 hours
            to configure custom limits, integrations, and pricing for your business.
          </p>
        </div>
      )}

      {/* What's included */}
      <div className="rounded-xl bg-graphite-800/40 border border-graphite-700 p-4">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">
          What&apos;s included in {plan.name}
        </p>
        <div className="grid grid-cols-2 gap-1">
          {plan.included_modules.slice(0, 10).map((key) => {
            const cat = MODULE_CATALOG[key]
            if (!cat) return null
            return (
              <div key={key} className="flex items-center gap-2 text-xs text-white/60">
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Step7Confirm({ state, subdomainPreview }: { state: WizardState; subdomainPreview: string }) {
  const plan = PLAN_CATALOG[state.selectedPlanKey]
  const enabledCount = plan.included_modules.length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Ready to create your workspace?</h2>
        <p className="text-sm text-white/40 mt-1">Review your details before we get started.</p>
      </div>

      {/* Summary cards */}
      <div className="space-y-3">
        <SummaryRow label="Account" value={state.email} icon="👤" />
        <SummaryRow label="Business" value={state.businessName} icon="🏢" />
        <SummaryRow label="Workspace URL" value={`${subdomainPreview}.crm.app`} icon="🔗" />
        <SummaryRow
          label="Plan"
          value={`${plan.name} — ${plan.is_custom ? 'Custom pricing' : `$${Math.floor(plan.price_monthly_cents / 100)}/mo`}`}
          icon="💼"
        />
        <SummaryRow label="Modules enabled" value={`${enabledCount} modules`} icon="✅" />
      </div>

      {/* Enabled modules preview */}
      <div className="rounded-xl bg-graphite-800/40 border border-graphite-700 p-4">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Modules being enabled</p>
        <div className="grid grid-cols-2 gap-1">
          {plan.included_modules.map((key) => {
            const cat = MODULE_CATALOG[key]
            if (!cat) return null
            return (
              <div key={key} className="flex items-center gap-2 text-xs text-green-400">
                <span className="text-[10px]">✓</span>
                <span>{cat.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-white/30 text-center">
        By creating your workspace you agree to our Terms of Service & Privacy Policy.
        Your 14-day free trial starts today.
      </p>
    </div>
  )
}

function SummaryRow({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-graphite-800/50 border border-graphite-700 px-4 py-3">
      <span className="text-base">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-white/40 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-white font-medium truncate">{value}</p>
      </div>
    </div>
  )
}
