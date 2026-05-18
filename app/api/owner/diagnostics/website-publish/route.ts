// app/api/owner/diagnostics/website-publish/route.ts
//
// Owner-only diagnostics for the website publish pipeline.
// Helps reveal why the live site is not changing after publish.
//
// GET /api/owner/diagnostics/website-publish
// GET /api/owner/diagnostics/website-publish?tenant_id=<uuid>

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ ok: false, error: 'Owner or admin only' }, { status: 403 })
  }

  const params = req.nextUrl.searchParams
  const bodyTenantId = sanitizeTenantId(params.get('tenant_id'))
  const tenantId = bodyTenantId ?? sanitizeTenantId(ctx.tenant_id)

  if (!tenantId) {
    return NextResponse.json({ ok: false, error: 'No tenant_id resolved' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any

  const suggestedFixes: string[] = []

  try {
    // ── Tenant info ──────────────────────────────────────────────────────────
    const { data: tenant } = await db
      .from('tenants')
      .select('id, slug, name')
      .eq('id', tenantId)
      .maybeSingle() as { data: Record<string, string> | null; error: unknown }

    // ── site_settings ────────────────────────────────────────────────────────
    const { data: settings } = await db
      .from('site_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown }

    const isPublished       = Boolean(settings?.is_published)
    const publishedAt       = settings?.published_at as string | null ?? null
    const lastVersionId     = settings?.last_published_version_id as string | null ?? null
    const hasUnpublished    = Boolean(settings?.has_unpublished_changes)
    const activeTemplateKey = (settings?.active_template_key as string | null) ?? null
    const designSystem      = settings?.design_system as Record<string, unknown> | null ?? null
    const themeData         = settings?.theme as Record<string, unknown> | null ?? null

    if (!settings) {
      suggestedFixes.push('No site_settings row found for this tenant. Run a publish to create one.')
    }
    if (!isPublished) {
      suggestedFixes.push('site_settings.is_published = false. The site is unpublished — click Publish in the builder.')
    }
    if (!publishedAt) {
      suggestedFixes.push('site_settings.published_at is null. Run migration 072 and publish once to populate it.')
    }
    if (hasUnpublished) {
      suggestedFixes.push('has_unpublished_changes = true. Publish the site to push draft changes live.')
    }
    if (!designSystem || Object.keys(designSystem).length === 0) {
      suggestedFixes.push('design_system column is empty. Apply a template or run AI Restyle, then publish.')
    }

    // ── site_pages ───────────────────────────────────────────────────────────
    const { data: pages } = await db
      .from('site_pages')
      .select('id, status, slug, title, sort_order')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true }) as { data: Record<string, unknown>[] | null; error: unknown }

    const allPages       = pages ?? []
    const draftPages     = allPages.filter((p) => p.status === 'draft')
    const publishedPages = allPages.filter((p) => p.status === 'published')

    if (draftPages.length > 0 && publishedPages.length === 0) {
      suggestedFixes.push(`All ${draftPages.length} page(s) are still in draft. Publish to promote them.`)
    }
    if (allPages.length === 0) {
      suggestedFixes.push('No pages found for this tenant. Create a Home page first.')
    }

    // ── site_sections ────────────────────────────────────────────────────────
    const pageIds = allPages.map((p) => p.id as string)

    let allSections: Record<string, unknown>[] = []
    if (pageIds.length > 0) {
      const { data: secs } = await db
        .from('site_sections')
        .select('id, page_id, section_type, is_visible, sort_order, style_config')
        .in('page_id', pageIds)
        .order('sort_order', { ascending: true }) as { data: Record<string, unknown>[] | null; error: unknown }
      allSections = secs ?? []
    }

    const visibleSections  = allSections.filter((s) => s.is_visible !== false)
    const hiddenSections   = allSections.filter((s) => s.is_visible === false)
    const sectionsWithDesign = allSections.filter((s) => {
      const sc = s.style_config as Record<string, unknown> | null
      return sc && typeof sc === 'object' && sc.design && Object.keys(sc.design as object).length > 0
    })

    if (visibleSections.length === 0 && allSections.length > 0) {
      suggestedFixes.push(`All ${allSections.length} sections have is_visible=false. Check applySnapshotToWebsiteTables — sections may have been hidden on last publish.`)
    }

    // ── website_builder_drafts ────────────────────────────────────────────────
    const { data: draft } = await db
      .from('website_builder_drafts')
      .select('dirty, updated_at, base_version_id')
      .eq('tenant_id', tenantId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown }

    const isDirty = Boolean(draft?.dirty)
    if (isDirty) {
      suggestedFixes.push('website_builder_drafts.dirty = true. A stale draft snapshot exists and may override live edits on next publish. Publish once to clear it (now uses forPublish=true to avoid this).')
    }

    // ── Latest site_versions ──────────────────────────────────────────────────
    const { data: versions } = await db
      .from('site_versions')
      .select('id, status, source, page_count, section_count, published_at, created_at, version_number')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5) as { data: Record<string, unknown>[] | null; error: unknown }

    const latestPublished = (versions ?? []).find((v) => v.status === 'published') ?? null

    // ── Column presence check ─────────────────────────────────────────────────
    const { data: cols } = await db
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'site_settings')
      .in('column_name', ['published_at', 'last_published_version_id', 'has_unpublished_changes', 'design_system']) as
      { data: { column_name: string }[] | null; error: unknown }

    const colSet = new Set((cols ?? []).map((c) => c.column_name))
    const missingCols = ['published_at', 'last_published_version_id', 'has_unpublished_changes', 'design_system']
      .filter((c) => !colSet.has(c))

    if (missingCols.length > 0) {
      suggestedFixes.push(`Missing columns on site_settings: ${missingCols.join(', ')}. Run migration 072_fix_website_publish_state.sql.`)
    }

    // ── Auth user vs profile ID check ─────────────────────────────────────────
    // Verify ctx.auth_id is what gets written to site_versions.created_by.
    // The FK requires auth.users.id, not public.users.id (ctx.id).
    const authId  = ctx.auth_id
    const profileId = ctx.id
    const authIdValid   = typeof authId  === 'string' && /^[0-9a-f-]{36}$/i.test(authId)
    const profileIdDiff = authId !== profileId

    if (!authIdValid) {
      suggestedFixes.push('ctx.auth_id is not a valid UUID. Cannot safely write site_versions.created_by.')
    }

    // ── Checkpoint insert test ────────────────────────────────────────────────
    // Try inserting a diagnostic checkpoint row and immediately delete it.
    let canInsertCheckpoint    = false
    let checkpointInsertError: Record<string, unknown> | null = null

    // Only run if we have a tenantId and a valid auth UUID
    if (tenantId && authIdValid) {
      try {
        const { data: nextNum } = await db.rpc('get_next_site_version_number', { p_tenant_id: tenantId }) as
          { data: number | null; error: unknown }

        const testVersionNumber = (nextNum ?? 9000) + 9900 // far above real range

        const { data: testRow, error: testInsertErr } = await db
          .from('site_versions')
          .insert({
            tenant_id:      tenantId,
            version_number: testVersionNumber,
            label:          '_diagnostic_test',
            source:         'manual',
            status:         'draft',
            snapshot:       { diagnostic: true },
            page_count:     0,
            section_count:  0,
            created_by:     authId,
          })
          .select('id')
          .single() as { data: { id: string } | null; error: Record<string, unknown> | null }

        if (testInsertErr) {
          checkpointInsertError = {
            code:    testInsertErr.code,
            message: testInsertErr.message,
            details: testInsertErr.details,
            hint:    testInsertErr.hint,
          }
          suggestedFixes.push(`Checkpoint insert test FAILED: ${testInsertErr.message ?? 'unknown error'}. ` +
            'Check site_versions CHECK constraints and RLS policies.')
        } else {
          canInsertCheckpoint = true
          // Clean up test row
          if (testRow?.id) {
            await db.from('site_versions').delete().eq('id', testRow.id)
          }
        }
      } catch (checkErr) {
        checkpointInsertError = { message: checkErr instanceof Error ? checkErr.message : String(checkErr) }
      }
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const ok = suggestedFixes.length === 0

    return NextResponse.json({
      ok,
      tenantId,
      tenantSlug:        tenant?.slug ?? null,
      tenantName:        tenant?.name ?? null,

      // Settings state
      isPublished,
      publishedAt,
      lastPublishedVersionId: lastVersionId,
      hasUnpublishedChanges:  hasUnpublished,
      activeTemplateKey,
      hasDesignSystem:        (designSystem && Object.keys(designSystem).length > 0),
      hasLegacyTheme:         (themeData && Object.keys(themeData).length > 0),

      // Pages
      draftPageCount:     draftPages.length,
      publishedPageCount: publishedPages.length,
      totalPageCount:     allPages.length,
      pages:              allPages.map((p) => ({ id: p.id, slug: p.slug, status: p.status, title: p.title })),

      // Sections
      totalSectionCount:   allSections.length,
      visibleSectionCount: visibleSections.length,
      hiddenSectionCount:  hiddenSections.length,
      sectionsWithDesign:  sectionsWithDesign.length,

      // Draft
      draftIsDirty: isDirty,
      draftUpdatedAt: draft?.updated_at ?? null,

      // Latest versions
      latestVersions: (versions ?? []).map((v) => ({
        id:          v.id,
        status:      v.status,
        source:      v.source,
        pageCount:   v.page_count,
        sectionCount: v.section_count,
        publishedAt: v.published_at,
        createdAt:   v.created_at,
        versionNumber: v.version_number,
      })),
      latestPublishedVersion: latestPublished ? {
        id:         latestPublished.id,
        pageCount:  latestPublished.page_count,
        sectionCount: latestPublished.section_count,
        publishedAt: latestPublished.published_at,
        createdAt:  latestPublished.created_at,
      } : null,

      // Column health
      missingColumns: missingCols,
      columnCheck: {
        published_at:              colSet.has('published_at'),
        last_published_version_id: colSet.has('last_published_version_id'),
        has_unpublished_changes:   colSet.has('has_unpublished_changes'),
        design_system:             colSet.has('design_system'),
      },

      // Auth ID health — most common cause of checkpoint failures
      authCheck: {
        authId,
        profileId,
        authIdValid,
        profileIdDifferentFromAuthId: profileIdDiff,
        noteIfFalse: 'If profileIdDifferentFromAuthId=false, ctx.auth_id and ctx.id are the same UUID (unusual)',
        requirementNote: 'site_versions.created_by REFERENCES auth.users(id). Must use ctx.auth_id, not ctx.id.',
      },

      // Checkpoint test
      canInsertCheckpoint,
      checkpointInsertError,

      // Public loader behavior
      publicLoaderMode:          'public-published',
      publicRouteUsesPublishedData: true,
      cacheMode:                 'force-dynamic (revalidate=0)',

      // Diagnosis
      suggestedFixes,
    })
  } catch (err) {
    return NextResponse.json({
      ok:    false,
      error: err instanceof Error ? err.message : 'Diagnostic error',
      tenantId,
    }, { status: 500 })
  }
}
