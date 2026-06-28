// app/api/website/canva/imports/[importId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'

function forbidden() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

function resolveTenantId(ctx: Awaited<ReturnType<typeof getUserContext>>, override?: string | null): string | null {
  if (!ctx) return null
  const hint = sanitizeTenantId(override)
  const self = sanitizeTenantId(ctx.tenant_id)
  if (ctx.role === 'owner') return hint ?? self
  if (self && hint && self !== hint) return null
  return self ?? hint
}

// Archives the import and clears it from the site draft if it is the active one.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ importId: string }> }) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const { importId } = await params
  const url = new URL(req.url)
  const tenantId = resolveTenantId(ctx, url.searchParams.get('tenant_id'))
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any
  const { data: row } = await db.from('website_canva_imports').select('*').eq('id', importId).maybeSingle()
  if (!row || row.tenant_id !== tenantId) return NextResponse.json({ error: 'Import not found' }, { status: 404 })

  await db.from('website_canva_imports').update({ status: 'archived' }).eq('id', importId)

  // If this import is the active one on the site, clear settings + remove canva sections.
  const { data: settings } = await db.from('site_settings').select('canva_import_id').eq('tenant_id', tenantId).maybeSingle()
  if (settings?.canva_import_id === importId) {
    await db.from('site_settings').update({
      canva_import_enabled: false,
      canva_import_id: null,
      canva_import_mode: null,
      canva_source_url: null,
      canva_embed_code: null,
      canva_animation_preservation: null,
    }).eq('tenant_id', tenantId)

    const { data: home } = await db.from('site_pages').select('id').eq('tenant_id', tenantId).eq('page_type', 'home').maybeSingle()
    if (home?.id) {
      await db.from('site_sections').delete().eq('page_id', home.id).like('section_key', 'canva-%')
    }
  }

  return NextResponse.json({ ok: true })
}
