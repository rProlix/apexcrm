// app/api/360/packages/[id]/route.ts — redirect stub
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function redirect301(req: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, req.url), 301)
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  return redirect301(req, `/api/product-360/packages/${id}`)
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  return redirect301(req, `/api/product-360/packages/${id}`)
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  return redirect301(req, `/api/product-360/packages/${id}`)
}
