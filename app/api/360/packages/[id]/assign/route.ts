// app/api/360/packages/[id]/assign/route.ts — redirect stub
// The attach/assign logic has moved to /api/product-360/packages/[packageId]
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const url = new URL(`/api/product-360/packages/${id}`, req.url)
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))
  return NextResponse.redirect(url, 308)
}
