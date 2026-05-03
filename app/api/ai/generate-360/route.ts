// DEPRECATED: Use /api/360/packages instead.
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ error: 'Deprecated. Use /api/360/packages' }, { status: 410 })
}
export async function POST() {
  return NextResponse.json({ error: 'Deprecated. Use /api/360/packages' }, { status: 410 })
}
