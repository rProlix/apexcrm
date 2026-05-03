// app/api/360/packages/[id]/generate/route.ts
// POST /api/360/packages/[id]/generate
//
// Starts (or retries) AI frame generation for a package.
// Owner / admin only.
// Sets status → generating, then fires background pipeline.
// Client polls GET /api/360/packages/[id] for progress.

import { NextRequest, NextResponse }  from 'next/server'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { resolve360ApiUser }          from '@/lib/360/auth'
import { generatePackage360 }         from '@/lib/360/generateFrames'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolve360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  const { data: pkg } = await supabase
    .from('product_360_packages')
    .select('id, tenant_id, status, prompt, name')
    .eq('id', id)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (user.role !== 'owner' && pkg.tenant_id !== user.tenant_id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (pkg.status === 'generating')
    return NextResponse.json({ error: 'Generation already in progress' }, { status: 409 })

  if (!pkg.prompt?.trim()) {
    return NextResponse.json(
      { error: 'A prompt or product description is required before generating' },
      { status: 400 },
    )
  }

  // Update source_type to ai
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('product_360_packages')
    .update({ source_type: 'ai', status: 'queued' })
    .eq('id', id)

  // Fire-and-forget (Fluid Compute — up to 300s)
  generatePackage360(id).catch(err =>
    console.error('[POST /api/360/packages/[id]/generate] background error:', err)
  )

  return NextResponse.json({ status: 'queued', packageId: id })
}
