// app/api/website/ai-images/plan/route.ts
// POST /api/website/ai-images/plan
// Inspects the website structure and creates AI image plans using Gemini.
// Uses buildWebsiteImageContext to pull rich business data before planning.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { planWebsiteImages } from '@/lib/ai/websiteImagePlanner'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
import { buildWebsiteImageContext } from '@/lib/website-ai/buildWebsiteImageContext'
import {
  isSchemaCacheError,
  isFkCreatedByError,
  MISSING_TABLE_MESSAGE,
  MISSING_API_KEY_MESSAGE,
} from '@/lib/website-ai/imagePipelineErrors'
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

  // Check API key before calling the planner
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: MISSING_API_KEY_MESSAGE, code: 'MISSING_API_KEY' }, { status: 503 })
  }

  // ── Build rich context (pulls business description, services, products,
  //    AI autofill results, section content, reviews) ─────────────────────
  const richCtx = await buildWebsiteImageContext(tenantId)

  if (!richCtx.sectionDetails.length && !richCtx.pages.length) {
    return NextResponse.json({
      plans:   [],
      warnings: ['No pages or sections found. Run AI Autofill first to generate website content.'],
      planGroupId: null,
      count:   0,
    })
  }

  // Convert to ImagePlannerContext (extends it with rich fields)
  const plannerCtx: ImagePlannerContext = {
    tenantId:            richCtx.tenantId,
    tenantName:          richCtx.tenantName,
    businessType:        richCtx.autofillBusinessType ?? richCtx.businessCategory,
    businessCategory:    richCtx.businessCategory,
    autofillBusinessType: richCtx.autofillBusinessType,
    autofillSummary:     richCtx.autofillSummary,
    businessDescription: richCtx.businessDescription,
    hasStore:            richCtx.hasStore,
    pages:               richCtx.pages,
    // Provide both legacy sections shape AND rich sectionDetails
    sections:            richCtx.sectionDetails.map(s => ({
      id:           s.id,
      page_id:      s.page_id,
      section_type: s.section_type,
      content:      s.content,
    })),
    sectionDetails:      richCtx.sectionDetails,
    services:            richCtx.services,
    topProducts:         richCtx.topProducts,
    reviews:             richCtx.reviews,
    existingImageUrls:   richCtx.existingImageUrls,
    productCount:        richCtx.productCount,
    siteTagline:         richCtx.siteTagline,
    colorPalette:        richCtx.colorPalette,
  }

  const { result, error } = await planWebsiteImages(plannerCtx)
  if (error || !result)
    return NextResponse.json({ error: error ?? 'Planning failed.' }, { status: 500 })

  if (!result.plans.length) {
    return NextResponse.json({
      plans:       [],
      warnings:    result.warnings,
      planGroupId: result.plan_group_id,
      message:     'No images are needed for the current website structure.',
    })
  }

  // ── Persist plans ──────────────────────────────────────────────────────────
  const planGroupId = result.plan_group_id

  // Build section→id map for linking plans to actual section rows
  const sectionsByType = new Map<string, { id: string; page_id: string }>()
  for (const s of richCtx.sectionDetails) {
    if (!sectionsByType.has(s.section_type)) {
      sectionsByType.set(s.section_type, { id: s.id, page_id: s.page_id })
    }
  }

  const rows = result.plans.map(p => {
    const matched = sectionsByType.get(p.section_type ?? '') ?? null
    return {
      tenant_id:             tenantId,
      plan_group_id:         planGroupId,
      section_id:            matched?.id ?? null,
      page_id:               matched?.page_id ?? null,
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
    }
  })

  const supabase = getSupabaseServerClient()
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
        error:  'Website image plan failed: created_by FK violation. Run migration 055_fix_website_image_plans_created_by.sql.',
        code:   'FK_CREATED_BY',
        detail: insertErr.message,
      }, { status: 500 })
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  console.log('[AI-IMAGE][plan] Created plans', {
    tenantId,
    count:        created?.length ?? 0,
    planGroupId,
    businessType: plannerCtx.businessType,
    servicesCount: richCtx.services.length,
    reviewsCount:  richCtx.reviews.length,
  })

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
