export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { getTenantFromHost, type TenantRecord } from '@/lib/tenant/getTenantFromHost'
import { loadTenantConfig } from '@/lib/tenant/loadTenantConfig'
import { loadEnabledModules } from '@/lib/modules/loadEnabledModules'
import type { NavModule } from '@/modules/shared/moduleTypes'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { slugifyBusinessName } from '@/lib/validation/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // ── Auth guard ──────────────────────────────────────────────────────
  const sessionClient = await createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // ── Tenant resolution ───────────────────────────────────────────────
  const headersList = await headers()
  const host        = headersList.get('host') ?? ''
  const admin       = getSupabaseServerClient()

  let tenant = await getTenantFromHost(host)

  // If host-based resolution fails, fall back to the user's own tenant
  if (!tenant) {
    const { data: userRecord, error: userLookupErr } = await admin
      .from('users')
      .select('tenant_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userLookupErr && userLookupErr.code !== 'PGRST116') {
      console.error('[DashboardLayout] users lookup error:', userLookupErr)
    }

    if (userRecord?.tenant_id) {
      const { data, error: tenantLookupErr } = await admin
        .from('tenants')
        .select('*')
        .eq('id', userRecord.tenant_id)
        .eq('status', 'active')
        .single()
      if (tenantLookupErr) console.error('[DashboardLayout] tenant-by-id error:', tenantLookupErr)
      tenant = (data as unknown as TenantRecord) ?? null
    }
  }

  // Local dev fallback: use the first active tenant when running on localhost
  if (!tenant && process.env.NODE_ENV === 'development') {
    const { data, error: devFallbackErr } = await admin
      .from('tenants')
      .select('*')
      .eq('status', 'active')
      .limit(1)
      .single()
    if (devFallbackErr && devFallbackErr.code !== 'PGRST116') {
      console.error('[DashboardLayout] dev-fallback error:', devFallbackErr)
    }
    tenant = (data as unknown as TenantRecord) ?? null

    // Persist the link so downstream pages can find the tenant from the users table.
    if (tenant && user) {
      await admin.from('users').upsert(
        { auth_user_id: user.id, tenant_id: tenant.id, email: user.email ?? '', role: 'admin', status: 'active' },
        { onConflict: 'auth_user_id' }
      )
    }
  }

  // Auto-recovery: authenticated user with no workspace (e.g. they signed up
  // while email confirmation was required and the tenant was never created).
  if (!tenant && user.email) {
    console.log('[DashboardLayout] No tenant found — attempting auto-recovery for', user.email)
    const rawName      = (user.user_metadata?.businessName as string | undefined) || user.email.split('@')[0]
    const businessName = rawName.trim() || 'My Workspace'
    let   slug         = slugifyBusinessName(businessName)

    for (let i = 0; i < 6; i++) {
      const { data: clash } = await admin.from('tenants').select('id').eq('slug', slug).maybeSingle()
      if (!clash) break
      slug = `${slugifyBusinessName(businessName)}-${Math.random().toString(36).slice(2, 5)}`
    }

    const { data: newTenant, error: insertErr } = await admin
      .from('tenants')
      .insert({
        name:      businessName,
        slug,
        subdomain: slug,
        status:    'active',
        branding:  { primary_color: '#c9a84c', accent: 'gold', industry: 'general', logo_url: null },
      })
      .select('*')
      .single()

    if (insertErr) {
      console.error('[DashboardLayout] auto-recovery tenant insert error:', insertErr)
    } else if (newTenant) {
      const { error: upsertErr } = await admin.from('users').upsert(
        { tenant_id: newTenant.id, auth_user_id: user.id, email: user.email, role: 'admin', status: 'active' },
        { onConflict: 'auth_user_id' }
      )
      if (upsertErr) console.error('[DashboardLayout] auto-recovery user upsert error:', upsertErr)

      const { error: modulesErr } = await admin.from('tenant_modules').insert(
        ['contacts', 'leads', 'appointments', 'payments', 'store', 'website'].map((key) => ({
          tenant_id: newTenant.id, module_key: key, enabled: true, config: {},
        }))
      )
      if (modulesErr) console.error('[DashboardLayout] auto-recovery modules insert error:', modulesErr)

      tenant = newTenant as unknown as TenantRecord
      console.log('[DashboardLayout] auto-recovery succeeded — tenant id:', newTenant.id)
    }
  }

  if (!tenant) {
    console.error('[DashboardLayout] All tenant resolution paths exhausted for user:', user.id)
    return <WorkspaceError message="We couldn't find your workspace." debug={`auth_user_id=${user.id} email=${user.email}`} />
  }

  // ── Config + modules ────────────────────────────────────────────────
  const config = await loadTenantConfig(tenant.id)

  if (!config) {
    console.error('[DashboardLayout] loadTenantConfig returned null for tenant:', tenant.id)
    return <WorkspaceError message="Your workspace configuration failed to load." debug={`tenant_id=${tenant.id}`} />
  }

  const navModules: NavModule[] = loadEnabledModules(config.enabledModuleKeys).map((m) => ({
    key:   m.key,
    label: m.label,
    href:  m.href,
  }))

  // ── User profile ─────────────────────────────────────────────────────
  const { data: profile } = await admin
    .from('users')
    .select('email, role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const userRole      = profile?.role ?? 'admin'
  const isPlatformAdmin = userRole === 'owner'

  return (
    <DashboardShell
      tenantName={config.tenant.name}
      userEmail={profile?.email ?? user.email ?? ''}
      userRole={userRole}
      modules={navModules}
      isPlatformAdmin={isPlatformAdmin}
    >
      {children}
    </DashboardShell>
  )
}

function WorkspaceError({ message, debug }: { message: string; debug?: string }) {
  const isDev = process.env.NODE_ENV === 'development'
  return (
    <div className="min-h-dvh bg-graphite-950 flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="inline-flex h-12 w-12 rounded-2xl bg-gold-gradient items-center justify-center mb-4 shadow-glow-gold">
          <span className="text-graphite-900 font-bold text-lg">A</span>
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Workspace unavailable</h1>
        <p className="text-sm text-white/50 mb-6 leading-relaxed">{message}</p>
        {isDev && debug && (
          <p className="text-xs text-white/20 font-mono mb-4 break-all">{debug}</p>
        )}
        <Link
          href="/login"
          className="inline-flex items-center justify-center h-10 px-6 rounded-xl font-semibold bg-gold-gradient text-graphite-900 text-sm hover:shadow-glow-gold transition-shadow duration-200"
        >
          Sign out and try again
        </Link>
        {isDev && (
          <p className="mt-4 text-xs text-white/20">
            <a href="/api/debug-session" className="underline">Run diagnostic →</a>
          </p>
        )}
      </div>
    </div>
  )
}
