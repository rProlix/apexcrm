import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage/uploadFile'
import { STORAGE_BUCKETS } from '@/lib/storage/buckets'
import { hasValidLogoSignature } from '@/lib/design-system/workspaceBranding'

const ACCEPTED_LOGO_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_LOGO_BYTES = 5 * 1024 * 1024

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose a logo image to upload.' }, { status: 400 })
  }
  if (!ACCEPTED_LOGO_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Logo must be a PNG, JPEG, or WebP image.' }, { status: 415 })
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: 'Logo must be 5 MB or smaller.' }, { status: 413 })
  }
  const fileBytes = new Uint8Array(await file.arrayBuffer())
  if (!hasValidLogoSignature(fileBytes, file.type)) {
    return NextResponse.json(
      { error: 'The selected file does not contain a valid logo image.' },
      { status: 415 }
    )
  }

  const db = getSupabaseServerClient()
  const { data: tenant, error: tenantError } = await db
    .from('tenants')
    .select('branding')
    .eq('id', ctx.tenant_id)
    .single()
  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Workspace branding could not be loaded.' }, { status: 500 })
  }

  const currentBranding = (tenant.branding ?? {}) as Record<string, unknown>
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  let uploadedPath: string | null = null

  try {
    const uploaded = await uploadFile({
      bucket: STORAGE_BUCKETS.BRAND_ASSETS,
      tenantId: ctx.tenant_id,
      pathParts: ['branding'],
      fileName: `workspace-logo-${Date.now()}.${extension}`,
      buffer: fileBytes,
      mimeType: file.type,
    })
    uploadedPath = uploaded.path
    if (!uploaded.publicUrl) throw new Error('The uploaded logo URL was not created.')

    const nextBranding = {
      ...currentBranding,
      logo_url: uploaded.publicUrl,
      logo_storage_path: uploaded.path,
      logo_updated_at: new Date().toISOString(),
    }
    const { error: updateError } = await db
      .from('tenants')
      .update({ branding: nextBranding, updated_at: new Date().toISOString() } as never)
      .eq('id', ctx.tenant_id)
    if (updateError) throw new Error(updateError.message)

    await db
      .from('site_settings')
      .update({ logo_url: uploaded.publicUrl, updated_at: new Date().toISOString() } as never)
      .eq('tenant_id', ctx.tenant_id)

    const previousPath = currentBranding.logo_storage_path
    if (
      typeof previousPath === 'string' &&
      previousPath.startsWith(`tenants/${ctx.tenant_id}/branding/`) &&
      previousPath !== uploaded.path
    ) {
      await db.storage.from(STORAGE_BUCKETS.BRAND_ASSETS).remove([previousPath])
    }

    return NextResponse.json({ url: uploaded.publicUrl })
  } catch (error) {
    if (uploadedPath) {
      await db.storage.from(STORAGE_BUCKETS.BRAND_ASSETS).remove([uploadedPath])
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Logo upload failed.' },
      { status: 500 }
    )
  }
}
