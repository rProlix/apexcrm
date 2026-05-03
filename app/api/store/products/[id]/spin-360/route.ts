// DEPRECATED: Use /api/360/public/[tenant]/[packageId] instead.
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ error: 'Deprecated. Use /api/360/public/[tenant]/[packageId]' }, { status: 410 })
}
