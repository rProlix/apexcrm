// app/api/website/publish/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * POST /api/website/publish
 * Body: { publish: boolean, tenant_id: string }
 *
 * tenant_id must always be sent from the client.
 *
 * When publishing (publish: true):
 *   - Sets site_settings.is_published = true
 *   - Promotes all draft pages to published
 *   - Saves a version snapshot
 *
 * When unpublishing (publish: false):
 *   - Sets site_settings.is_published = false
 */
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const body      = await req.json()
  const isPublish = Boolean(body.publish)

  // Resolve tenant_id:
  // - owner: accepts any tenant_id from body (platform-wide access)
  // - admin: must match their own ctx.tenant_id; body.tenant_id is accepted as
  //   a fallback when ctx.tenant_id is null (can occur if the users row was
  //   created without it during initial auto-recovery)
  let tenantId: string | null = null

  const bodyTenantId = sanitizeTenantId(body.tenant_id)

  if (ctx.role === 'owner') {
    tenantId = bodyTenantId ?? sanitizeTenantId(ctx.tenant_id)
  } else {
    const fromCtx  = sanitizeTenantId(ctx.tenant_id)
    const fromBody = bodyTenantId

    if (fromCtx && fromBody && fromCtx !== fromBody) {
      return forbidden()
    }

    tenantId = fromCtx ?? fromBody
  }

  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const db = getSupabaseServerClient()

  // Update site_settings.is_published
  const { data: settings, error: settingsErr } = await db
    .from('site_settings')
    .upsert({ tenant_id: tenantId, is_published: isPublish }, { onConflict: 'tenant_id' })
    .select('*')
    .single()

  if (settingsErr) {
    return NextResponse.json({ error: settingsErr.message }, { status: 500 })
  }

  if (isPublish) {
    // Promote draft pages to published
    await db
      .from('site_pages')
      .update({ status: 'published' })
      .eq('tenant_id', tenantId)
      .eq('status', 'draft')

    // Save version snapshot for rollback
    const [pagesResult, navResult] = await Promise.all([
      db
        .from('site_pages')
        .select('*, site_sections(*)')
        .eq('tenant_id', tenantId)
        .neq('status', 'archived'),
      db
        .from('site_navigation_items')
        .select('*')
        .eq('tenant_id', tenantId),
    ])

    const snapshot = {
      settings:   settings,
      pages:      pagesResult.data ?? [],
      navigation: navResult.data ?? [],
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('site_versions') as any).insert({
      tenant_id:    tenantId,
      version_name: `Published ${new Date().toISOString()}`,
      snapshot:     snapshot,
      status:       'published',
    })
  }

  return NextResponse.json({
    success:    true,
    published:  isPublish,
    settings,
  })
}
