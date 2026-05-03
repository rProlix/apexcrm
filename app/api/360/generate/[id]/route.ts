// app/api/360/generate/[id]/route.ts
// REDIRECT: This endpoint has moved to /api/360/packages/[id]
// Kept as a stub to avoid 404s from old bookmarks or cached clients.

import { NextRequest, NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return NextResponse.redirect(`/api/360/packages/${id}`, 301)
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return NextResponse.redirect(`/api/360/packages/${id}/generate`, 301)
}
