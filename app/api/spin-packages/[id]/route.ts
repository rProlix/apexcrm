// DEPRECATED: Use /api/360/packages/[id] instead.
import { NextResponse } from 'next/server'

export async function GET() { return NextResponse.json({ error: 'Deprecated' }, { status: 410 }) }
export async function PATCH() { return NextResponse.json({ error: 'Deprecated' }, { status: 410 }) }
export async function DELETE() { return NextResponse.json({ error: 'Deprecated' }, { status: 410 }) }
