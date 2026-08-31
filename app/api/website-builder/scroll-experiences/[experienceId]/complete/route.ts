export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import {
  completeScrollExperienceUpload,
  resolveScrollTenant,
} from '@/lib/website-scroll-experience/server'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ experienceId: string }> }
) {
  const ctx = await getUserContext()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const tenantId = await resolveScrollTenant(ctx, body.tenantId)
  if (!ctx || !tenantId)
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  const { experienceId } = await context.params
  if (typeof body.experienceVersionId !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'experienceVersionId is required.' },
      { status: 400 }
    )
  }
  try {
    const result = await completeScrollExperienceUpload({
      tenantId,
      actorId: ctx.id,
      experienceId,
      experienceVersionId: body.experienceVersionId,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Upload completion failed.' },
      { status: 400 }
    )
  }
}
