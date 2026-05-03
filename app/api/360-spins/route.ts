// app/api/360-spins/route.ts
// DEPRECATED: Use /api/360/packages instead.
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ error: 'This endpoint is deprecated. Use /api/360/packages' }, { status: 410 })
}

export async function POST() {
  return NextResponse.json({ error: 'This endpoint is deprecated. Use /api/360/packages' }, { status: 410 })
}
