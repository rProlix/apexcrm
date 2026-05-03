// app/api/360/packages/[id]/generate/route.ts — redirect stub
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  return NextResponse.redirect(new URL(`/api/product-360/packages/${id}/generate`, req.url), 301)
}
