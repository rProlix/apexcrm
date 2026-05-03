// DEPRECATED: Use /api/360/packages/[id]/generate instead.
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Deprecated. Use /api/360/packages/[id]/generate' }, { status: 410 })
}
