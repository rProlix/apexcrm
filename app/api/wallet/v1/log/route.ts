import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { logs?: unknown } | null
  if (Array.isArray(body?.logs)) {
    console.info('[apple-wallet:device-log]', { count: Math.min(body.logs.length, 100) })
  }
  return new NextResponse(null, { status: 200 })
}
