// app/api/website/ai-images/section-generate/route.ts
// POST /api/website/ai-images/section-generate
// One-click: build context for a specific section, create an image plan,
// generate the image with Imagen 4, and apply it to the section.
//
// Used by the "Generate AI Image" button in the EditorSidebar.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
import { buildWebsiteImageContext } from '@/lib/website-ai/buildWebsiteImageContext'
import { createSectionImageBrief } from '@/lib/website-ai/createSectionImageBrief'
import { composeWebsiteImagePrompt } from '@/lib/website-ai/composeWebsiteImagePrompt'
import { generateWebsiteImage } from '@/lib/ai/websiteImageGenerator'
import { buildImageContentPatch, mergeImageIntoContent } from '@/lib/website-builder/imagePlacement'
import { getSafeCreatedBy } from '@/lib/auth/getSafeCreatedBy'
import {
  isSchemaCacheError,
  isFkCreatedByError,
  MISSING_TABLE_MESSAGE,
  MISSING_BUCKET_MESSAGE,
  MISSING_API_KEY_MESSAGE,
} from '@/lib/website-ai/imagePipelineErrors'
import type { WebsiteImagePlan } from '@/lib/ai/websiteImageTypes'
import type { RichSectionDetail } from '@/lib/website-ai/buildWebsiteImageContext'

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

  const sectionId = typeof body.sectionId === 'string' ? body.sectionId : null
  if (!sectionId) return NextResponse.json({ error: 'sectionId is required' }, { status: 422 })

  // Check API key
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: MISSING_API_KEY_MESSAGE, code: 'MISSING_API_KEY' }, { status: 503 })
  }

  const access = await requireAiAutofillAccess(
    ctx.role === 'owner' ? (body.tenantId as string | null) : null,
  )
  if (!access) return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  const tenantId = access.tenantId
  const supabase = getSupabaseServerClient()

  // ── Verify section belongs to this tenant ──────────────────────────────────
  const { data: section, error: sectionErr } = await supabase
    .from('site_sections')
    .select('id, page_id, section_type, content, tenant_id')
    .eq('id', sectionId)
    .eq('tenant_id', tenantId)
    .single()

  if (sectionErr || !section) {
    return NextResponse.json({ error: 'Section not found or access denied.' }, { status: 404 })
  }

  const sectionContent = (section.content && typeof section.content === 'object'
    ? section.content
    : {}) as Record<string, unknown>

  // ── Build rich context ────────────────────────────────────────────────────
  const richCtx = await buildWebsiteImageContext(tenantId)

  // Find or create a RichSectionDetail for this specific section
  const sectionDetail: RichSectionDetail = richCtx.sectionDetails.find(s => s.id === sectionId)
    ?? buildFallbackSectionDetail({
        id:           section.id,
        page_id:      section.page_id ?? '',
        section_type: section.section_type,
        content:      sectionContent,
      })

  // ── Build image brief + compose prompt ───────────────────────────────────
  const brief  = createSectionImageBrief(richCtx, sectionDetail)
  const composed = composeWebsiteImagePrompt(brief, richCtx)

  // ── Determine aspect ratio ────────────────────────────────────────────────
  const aspectRatio = resolveAspectRatio(section.section_type)

  // ── Create image plan row ─────────────────────────────────────────────────
  const planRow = {
    tenant_id:             tenantId,
    plan_group_id:         null as string | null,
    section_id:            sectionId,
    page_id:               section.page_id as string | null,
    placement_key:         `${section.section_type}_${sectionId.slice(0, 8)}`,
    section_type:          section.section_type,
    image_role:            brief.imageRole,
    title:                 `AI Image: ${section.section_type}`,
    reason:                brief.imageGoal,
    business_goal:         brief.imageGoal,
    image_description:     brief.subject,
    visual_style:          brief.styling,
    prompt:                composed.prompt,
    negative_prompt:       brief.shouldAvoid.join(', ') || null,
    aspect_ratio:          aspectRatio,
    priority:              10,
    use_existing_if_avail: false,
    status:                'generating' as const,
    source_type:           'ai_builder' as const,
    created_by:            getSafeCreatedBy(ctx.auth_id),
  }

  const { data: plan, error: planInsertErr } = await supabase
    .from('website_image_plans')
    .insert(planRow as never)
    .select('*')
    .single()

  if (planInsertErr || !plan) {
    if (isSchemaCacheError(planInsertErr)) {
      return NextResponse.json({ error: MISSING_TABLE_MESSAGE, code: 'MISSING_TABLE' }, { status: 503 })
    }
    if (isFkCreatedByError(planInsertErr)) {
      return NextResponse.json({ error: 'FK created_by violation. Run migration 055.', code: 'FK_CREATED_BY' }, { status: 500 })
    }
    return NextResponse.json({ error: planInsertErr?.message ?? 'Failed to create plan.' }, { status: 500 })
  }

  // ── Generate image ────────────────────────────────────────────────────────
  const result = await generateWebsiteImage({
    plan:         plan as WebsiteImagePlan,
    tenantId,
    businessType: richCtx.autofillBusinessType ?? richCtx.businessCategory,
    createdBy:    getSafeCreatedBy(ctx.auth_id),
  })

  if (result.error) {
    const isBucket = result.error.includes('bucket') || result.error.includes('storage')
    return NextResponse.json({
      error:   result.error,
      code:    isBucket ? 'MISSING_BUCKET' : 'GENERATION_FAILED',
      jobId:   result.jobId,
      planId:  plan.id,
      applied: false,
    }, { status: 500 })
  }

  // ── Apply to section ──────────────────────────────────────────────────────
  const { contentPatch, placementDescription } = buildImageContentPatch(
    section.section_type,
    brief.imageRole,
    result.publicUrl,
    result.altText,
    plan.id,
  )

  const mergedContent = mergeImageIntoContent(
    sectionContent,
    contentPatch,
  )

  const { error: updateErr } = await supabase
    .from('site_sections')
    .update({ content: mergedContent as never, updated_at: new Date().toISOString() } as never)
    .eq('id', sectionId)
    .eq('tenant_id', tenantId)

  if (updateErr) {
    return NextResponse.json({
      generated:   true,
      applied:     false,
      error:       `Section update failed: ${updateErr.message}`,
      jobId:       result.jobId,
      publicUrl:   result.publicUrl,
      planId:      plan.id,
    }, { status: 207 })
  }

  // Mark plan as applied
  await supabase
    .from('website_image_plans')
    .update({
      status:     'applied',
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', plan.id)

  // Return the updated section content so the builder can refresh immediately
  const { data: updatedSection } = await supabase
    .from('site_sections')
    .select('id, section_type, content, is_visible, sort_order, page_id')
    .eq('id', sectionId)
    .single()

  console.log('[AI-IMAGE][section-generate] Complete', {
    tenantId,
    sectionId,
    sectionType: section.section_type,
    planId:      plan.id,
    jobId:       result.jobId,
    publicUrl:   result.publicUrl,
    businessType: richCtx.autofillBusinessType ?? richCtx.businessCategory,
    placementDescription,
  })

  return NextResponse.json({
    generated:           true,
    applied:             true,
    planId:              plan.id,
    jobId:               result.jobId,
    publicUrl:           result.publicUrl,
    storagePath:         result.storagePath,
    altText:             result.altText,
    sectionId,
    sectionType:         section.section_type,
    placementDescription,
    updatedSection,
    // Debug context (owner/admin only, not exposed to customers)
    _debug: {
      businessType:  richCtx.autofillBusinessType ?? richCtx.businessCategory ?? 'unknown',
      imageRole:     brief.imageRole,
      imageGoal:     brief.imageGoal,
      promptLength:  composed.prompt.length,
      reasoning:     composed.reasoning,
      servicesUsed:  richCtx.services.slice(0, 3).map(s => s.name),
      reviewsUsed:   richCtx.reviews.length,
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFallbackSectionDetail(section: {
  id: string
  page_id: string
  section_type: string
  content: Record<string, unknown>
}): RichSectionDetail {
  const c = section.content
  return {
    id:           section.id,
    page_id:      section.page_id,
    section_type: section.section_type,
    headline:     firstString(c.headline, c.heading, c.title) ?? '',
    body:         firstString(c.body, c.subheadline, c.subtitle, c.description) ?? '',
    items:        extractItemStrings(c),
    ctaText:      firstString(c.ctaLabel, c.cta_label) ?? '',
    imageUrl:     firstString(c.backgroundImage, c.background_image, c.imageUrl, c.image_url, c.image) ?? null,
    content:      c,
  }
}

function extractItemStrings(c: Record<string, unknown>): string[] {
  if (!Array.isArray(c.items)) return []
  return c.items
    .map((i: unknown) => {
      const o = (i && typeof i === 'object' && !Array.isArray(i)) ? i as Record<string, unknown> : {}
      return firstString(o.title, o.name, o.question) ?? ''
    })
    .filter(Boolean)
    .slice(0, 6)
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function resolveAspectRatio(sectionType: string): string {
  const ratioMap: Record<string, string> = {
    hero:         '16:9',
    about:        '3:2',
    feature_grid: '16:9',
    testimonials: '16:9',
    faq:          '16:9',
    contact:      '16:9',
    product_grid: '16:9',
    image_gallery: '4:3',
    cta:          '16:9',
  }
  return ratioMap[sectionType] ?? '16:9'
}
