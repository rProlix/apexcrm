// app/api/360/generate/route.ts
// REDIRECT: This endpoint has moved to /api/360/packages (POST)
// Kept as a stub to avoid 404s from old bookmarks or cached clients.

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has moved. Use POST /api/360/packages instead.' },
    { status: 410, headers: { Location: '/api/360/packages' } }
  )
}
