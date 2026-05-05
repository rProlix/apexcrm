// app/api/360/products/route.ts — redirect stub (canonical: /api/product-360/products)
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  const url = new URL('/api/product-360/products', req.url)
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))
  return NextResponse.redirect(url, 308)
}
