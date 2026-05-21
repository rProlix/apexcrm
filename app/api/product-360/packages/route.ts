// app/api/product-360/packages/route.ts
import { NextRequest, NextResponse }               from 'next/server'
import { resolveP360ApiUser, resolveTenantId }     from '@/lib/product-360/auth'
import { listPackages, createPackage, P360ApiError } from '@/lib/product-360/packageService'

export const dynamic = 'force-dynamic'

// GET /api/product-360/packages
// Query: tenantId (owner only), productId, archived
export async function GET(req: NextRequest) {
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const tenantId = resolveTenantId(user, searchParams.get('tenantId'))
  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  try {
    const packages = await listPackages({
      tenantId,
      productId:       searchParams.get('productId') ?? undefined,
      includeArchived: searchParams.get('archived') === 'true',
    })
    return NextResponse.json({ packages })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to list packages'
    console.error('[/api/product-360/packages GET] Error:', msg, { tenantId, role: user.role })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/product-360/packages
export async function POST(req: NextRequest) {
  const user = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const tenantId  = resolveTenantId(user, body.tenantId as string | null)
  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  const productId = body.productId as string | undefined
  if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 })

  const name = (body.name as string | undefined)?.trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  try {
    const pkg = await createPackage({
      tenantId,
      productId,
      createdBy:            user.userId,
      name,
      label:                (body.label as string | null | undefined) ?? ((body.preset as string | undefined)?.trim() || null),
      description:          body.description         as string | undefined,
      packageType:          body.packageType          as string | undefined,
      preset:               (body.preset             as string | null) ?? null,
      isPrimary:            !!(body.is_primary ?? body.isPrimary),
      startsAt:             (body.starts_at ?? body.startsAt ?? body.promo_starts_at) as string | null ?? null,
      endsAt:               (body.ends_at   ?? body.endsAt   ?? body.promo_ends_at)   as string | null ?? null,
      generationPrompt:     body.generationPrompt     as string | undefined,
      generationNotes:      body.generationNotes      as string | undefined,
      negativePrompt:       body.negativePrompt       as string | undefined,
      targetFrameCount:     body.targetFrameCount     as number | undefined,
      settings:             body.settings             as Record<string, unknown> | undefined,
      lightingPreset:       (body.lightingPreset      as string | null) ?? null,
      backgroundPreset:     (body.backgroundPreset    as string | null) ?? null,
      categoryPreset:       (body.categoryPreset      as string | null) ?? null,
      cameraPreset:         (body.cameraPreset        as string | null) ?? null,
      cameraDistance:       (body.cameraDistance      as number | null) ?? null,
      cameraHeight:         (body.cameraHeight        as number | null) ?? null,
      fov:                  (body.fov                 as number | null) ?? null,
      zoom:                 (body.zoom                as number | null) ?? null,
      shadowStrength:       (body.shadowStrength      as number | null) ?? null,
      reflectionIntensity:  (body.reflectionIntensity as number | null) ?? null,
      turnDirection:        (body.turnDirection as 'clockwise' | 'counter_clockwise' | undefined),
      outputWidth:          (body.outputWidth         as number | null) ?? null,
      outputHeight:         (body.outputHeight        as number | null) ?? null,
      promoTag:                (body.promoTag            as string | null) ?? null,
      aiModel:                 ((body.aiModel ?? body.generation_model) as string | undefined),
      generationProvider:      (body.generationProvider ?? body.generation_provider) as 'gemini' | 'leonardo' | undefined,
      generationMode:          (body.generationMode ?? body.generation_mode) as 'text_to_image' | 'reference_image' | undefined,
      referenceImageRequired:  !!(body.referenceImageRequired ?? body.reference_image_required),
      consistencyMode:         (body.consistencyMode ?? body.consistency_mode) as 'standard' | 'strict' | 'ultra_strict' | undefined,
      angleStrategy:           (body.angleStrategy ?? body.angle_strategy) as string | undefined,
    })
    return NextResponse.json({ ok: true, data: { package: pkg } }, { status: 201 })
  } catch (err) {
    if (err instanceof P360ApiError) {
      const ae = err.apiError
      const status =
        ae.type === 'not_found'  ? 404 :
        ae.type === 'forbidden'  ? 403 :
        ae.type === 'validation_error' || ae.type === 'constraint_error' ? 422 : 500
      console.error('[/api/product-360/packages POST] P360ApiError:', ae)
      return NextResponse.json({ ok: false, error: ae }, { status })
    }
    const msg = err instanceof Error ? err.message : 'Failed to create package'
    console.error('[/api/product-360/packages POST] Unexpected error:', msg)
    return NextResponse.json(
      { ok: false, error: { type: 'internal', title: 'Package creation failed', message: msg } },
      { status: 500 },
    )
  }
}
