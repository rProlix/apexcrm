// DEPRECATED: Use /api/360/packages/[id]/attach instead.
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Deprecated. Use /api/360/packages/[id]/attach' }, { status: 410 })
}
