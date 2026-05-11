export const dynamic = 'force-dynamic'

import { NextResponse }              from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { MODULE_CATALOG, PLAN_CATALOG, type CRMModuleKey, type CRMPlanKey } from '@/lib/plans/planCatalog'

/**
 * GET /api/tenant/modules
 *
 * Returns enabled and locked modules for the authenticated user's tenant.
 * Used by the dashboard sidebar and setup checklist.
 */
export async function GET() {
  try {
    const sessionClient = await createSessionServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated.' }, { status: 401 })
    }

    const admin = getSupabaseServerClient() as any

    const { data: profile } = await admin
      .from('users')
      .select('tenant_id, role')
      .eq('auth_user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!profile?.tenant_id) {
      return NextResponse.json({ success: false, error: 'No workspace found.' }, { status: 404 })
    }

    const { data: rows } = await admin
      .from('tenant_modules')
      .select('module_key, enabled, is_locked, locked_reason, source, config')
      .eq('tenant_id', profile.tenant_id)

    const moduleMap = new Map(
      ((rows ?? []) as Array<{
        module_key: string; enabled: boolean; is_locked: boolean;
        locked_reason: string | null; source: string; config: Record<string, unknown>
      }>).map((r) => [r.module_key, r])
    )

    // Merge DB state with catalog
    const modules = (Object.keys(MODULE_CATALOG) as CRMModuleKey[]).map((key) => {
      const db      = moduleMap.get(key)
      const catalog = MODULE_CATALOG[key]
      return {
        key,
        label:         catalog.label,
        description:   catalog.description,
        icon:          catalog.icon,
        is_premium:    catalog.isPremium,
        min_plan:      catalog.minPlan,
        enabled:       db?.enabled ?? false,
        is_locked:     db?.is_locked ?? false,
        locked_reason: db?.locked_reason ?? null,
        source:        db?.source ?? 'plan',
        config:        db?.config ?? {},
      }
    })

    return NextResponse.json({
      success: true,
      tenantId: profile.tenant_id,
      userRole: profile.role,
      modules,
      enabled:  modules.filter((m) => m.enabled).map((m) => m.key),
      locked:   modules.filter((m) => m.is_locked).map((m) => m.key),
    })
  } catch (err) {
    console.error('[/api/tenant/modules GET] error:', err)
    return NextResponse.json({ success: false, error: 'Failed to load modules.' }, { status: 500 })
  }
}

/**
 * PATCH /api/tenant/modules
 *
 * Owner/admin can enable or disable a module, subject to plan constraints.
 * Body: { module_key: string, enabled: boolean }
 */
export async function PATCH(request: Request) {
  try {
    const sessionClient = await createSessionServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated.' }, { status: 401 })
    }

    const admin = getSupabaseServerClient() as any

    const { data: profile } = await admin
      .from('users')
      .select('tenant_id, role')
      .eq('auth_user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!profile?.tenant_id) {
      return NextResponse.json({ success: false, error: 'No workspace found.' }, { status: 404 })
    }

    if (!['owner', 'admin'].includes(profile.role)) {
      return NextResponse.json({ success: false, error: 'Only admins can manage modules.' }, { status: 403 })
    }

    const body = await request.json() as { module_key: string; enabled: boolean }
    const { module_key, enabled } = body

    if (!module_key || typeof enabled !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 })
    }

    // Check if module is locked
    const { data: mod } = await admin
      .from('tenant_modules')
      .select('is_locked, locked_reason')
      .eq('tenant_id', profile.tenant_id)
      .eq('module_key', module_key)
      .maybeSingle()

    if (mod?.is_locked && enabled) {
      return NextResponse.json({
        success: false,
        error:   mod.locked_reason ?? 'This module is locked by your current plan. Please upgrade to enable it.',
        locked:  true,
      }, { status: 403 })
    }

    // Get tenant's subscription to check plan
    const { data: sub } = await admin
      .from('subscriptions')
      .select('plan_key')
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle()

    const planKey = (sub?.plan_key ?? 'starter') as CRMPlanKey
    const planModules = new Set(PLAN_CATALOG[planKey]?.included_modules ?? [])

    if (enabled && !planModules.has(module_key as CRMModuleKey)) {
      const catalog = MODULE_CATALOG[module_key as CRMModuleKey]
      const minPlan = catalog?.minPlan ?? 'pro'
      return NextResponse.json({
        success: false,
        error:   `${catalog?.label ?? module_key} requires the ${PLAN_CATALOG[minPlan]?.name ?? 'Pro'} plan. Please upgrade to enable it.`,
        locked:  true,
      }, { status: 403 })
    }

    await admin
      .from('tenant_modules')
      .upsert(
        { tenant_id: profile.tenant_id, module_key, enabled, source: 'admin' },
        { onConflict: 'tenant_id,module_key' }
      )

    return NextResponse.json({ success: true, module_key, enabled })
  } catch (err) {
    console.error('[/api/tenant/modules PATCH] error:', err)
    return NextResponse.json({ success: false, error: 'Failed to update module.' }, { status: 500 })
  }
}
