// app/api/website/ai-images/plan/route.ts
// POST /api/website/ai-images/plan
// Inspects the website structure and creates AI image plans using Gemini.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { planWebsiteImages } from '@/lib/ai/websiteImagePlanner'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
import { isSchemaCacheError, isFkCreatedByError, MISSING_TABLE_MESSAGE, MISSING_API_KEY_MESSAGE } from '@/lib/website-ai/imagePipelineErrors'
import { getSafeCreatedBy } from '@/lib/auth/getSafeCreatedBy'
import type { ImagePlannerContext } from '@/lib/ai/websiteImageTypes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const access = await requireAiAutofillAccess(
    ctx.role === 'owner' ? (body.tenantId as string | null) : null,
  )
  if (!access)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  const tenantId = access.tenantId
  const supabase = getSupabaseServerClient()

  // Load tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', tenantId)
    .single()

  if (!tenant)
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })

  // Load pages
  const { data: pages = [] } = await supabase
    .from('site_pages')
    .select('id, slug, title, page_type')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .limit(20)

  // Load sections
  const { data: sections = [] } = await supabase
    .from('site_sections')
    .select('id, page_id, section_type, content')
    .eq('tenant_id', tenantId)
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .limit(50)

  // Load products count
  const { count: productCount } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  // Load site settings
  const { data: settings } = await supabase
    .from('site_settings')
    .select('site_name, brand_colors, theme')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // Check modules
  const { data: mod } = await supabase
    .from('tenant_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('module_key', 'store')
    .maybeSingle()

  // Collect existing image URLs to avoid re-generating what's already there
  const existingImageUrls: string[] = []
  for (const s of (sections ?? [])) {
    const c = s.content as Record<string, unknown>
    if (typeof c.image_url === 'string' && c.image_url) existingImageUrls.push(c.image_url)
    if (typeof c.background_image === 'string' && c.background_image) existingImageUrls.push(c.background_image)
    if (typeof c.banner_image === 'string' && c.banner_image) existingImageUrls.push(c.banner_image)
  }

  const plannerCtx: ImagePlannerContext = {
    tenantId,
    tenantName:        tenant.name,
    businessType:      null,
    hasStore:          mod?.enabled ?? false,
    pages:             (pages ?? []).map(p => ({
      id:        p.id,
      slug:      p.slug,
      title:     p.title,
      page_type: p.page_type,
    })),
    sections:          (sections ?? []).map(s => ({
      id:           s.id,
      page_id:      s.page_id,
      section_type: s.section_type,
      content:      s.content as Record<string, unknown>,
    })),
    existingImageUrls,
    productCount:      productCount ?? 0,
    siteTagline:       null,
    colorPalette:      settings?.brand_colors ? JSON.stringify(settings.brand_colors) : null,
  }

  // Check API key before calling the planner
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: MISSING_API_KEY_MESSAGE, code: 'MISSING_API_KEY' }, { status: 503 })
  }

  const { result, error } = await planWebsiteImages(plannerCtx)
  if (error || !result)
    return NextResponse.json({ error: error ?? 'Planning failed.' }, { status: 500 })

  if (!result.plans.length) {
    return NextResponse.json({
      plans:      [],
      warnings:   result.warnings,
      planGroupId: result.plan_group_id,
      message:    'No images are needed for the current website structure.',
    })
  }

  // Persist plans
  const planGroupId = result.plan_group_id
  const rows = result.plans.map(p => ({
    tenant_id:             tenantId,
    plan_group_id:         planGroupId,
    section_id:            null as string | null,
    page_id:               null as string | null,
    placement_key:         p.placement_key,
    section_type:          p.section_type,
    image_role:            p.image_role,
    title:                 p.title,
    reason:                p.reason,
    business_goal:         p.business_goal,
    image_description:     p.image_description,
    visual_style:          p.visual_style,
    prompt:                p.prompt,
    negative_prompt:       p.negative_prompt,
    aspect_ratio:          p.aspect_ratio,
    priority:              p.priority,
    use_existing_if_avail: p.use_existing_if_avail,
    status:                'planned' as const,
    created_by:            getSafeCreatedBy(ctx.auth_id),
  }))

  // Match sections by type
  const sectionsByType = new Map<string, string>()
  for (const s of (sections ?? [])) {
    if (!sectionsByType.has(s.section_type)) {
      sectionsByType.set(s.section_type, s.id)
    }
  }

  for (const row of rows) {
    const matchedSectionId = sectionsByType.get(row.section_type ?? '')
    if (matchedSectionId) row.section_id = matchedSectionId
    // match page_id from section
    const matchedSection = (sections ?? []).find(s => s.id === row.section_id)
    if (matchedSection) row.page_id = matchedSection.page_id
  }

  const { data: created, error: insertErr } = await supabase
    .from('website_image_plans')
    .insert(rows as never)
    .select('*')

  if (insertErr) {
    if (isSchemaCacheError(insertErr)) {
      return NextResponse.json({
        error:  MISSING_TABLE_MESSAGE,
        code:   'MISSING_TABLE',
        detail: insertErr.message,
      }, { status: 503 })
    }
    if (isFkCreatedByError(insertErr)) {
      console.error('[AI-IMAGE][plan] FK created_by violation:', insertErr)
      return NextResponse.json({
        error:  'Website image plan failed: created_by referenced a user that does not exist in auth.users. Run migration 055_fix_website_image_plans_created_by.sql and retry.',
        code:   'FK_CREATED_BY',
        detail: insertErr.message,
      }, { status: 500 })
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    planGroupId,
    plans:    created,
    warnings: result.warnings,
    count:    created?.length ?? 0,
  })
}

// GET /api/website/ai-images/plan — list plans for tenant
export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tenantIdParam   = searchParams.get('tenantId')
  const groupId         = searchParams.get('groupId')

  const access = await requireAiAutofillAccess(
    ctx.role === 'owner' ? tenantIdParam : null,
  )
  if (!access)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  const supabase = getSupabaseServerClient()
  let query = supabase
    .from('website_image_plans')
    .select('*')
    .eq('tenant_id', access.tenantId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(100)

  if (groupId) query = query.eq('plan_group_id', groupId)

  const { data, error } = await query
  if (error) {
    if (isSchemaCacheError(error)) {
      return NextResponse.json({
        error:  MISSING_TABLE_MESSAGE,
        code:   'MISSING_TABLE',
        detail: error.message,
        plans:  [],
      }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ plans: data ?? [] })
}
