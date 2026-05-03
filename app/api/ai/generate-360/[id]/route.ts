// DEPRECATED: Use /api/360/packages/[id] instead.
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ error: 'Deprecated. Use /api/360/packages/[id]' }, { status: 410 })
}
export async function DELETE() {
  return NextResponse.json({ error: 'Deprecated. Use /api/360/packages/[id]' }, { status: 410 })
}
