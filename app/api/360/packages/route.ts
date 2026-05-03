// app/api/360/packages/route.ts — redirect stub
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function redirect301(req: NextRequest, newPath: string) {
  const url = new URL(newPath, req.url)
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))
  return NextResponse.redirect(url, 301)
}

export function GET(req: NextRequest) {
  return redirect301(req, '/api/product-360/packages')
}
export function POST(req: NextRequest) {
  return redirect301(req, '/api/product-360/packages')
}
