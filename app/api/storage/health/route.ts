// app/api/storage/health/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/storage/health
// Owner-only endpoint that verifies all Supabase Storage buckets exist and
// have the correct public/private configuration.
//
// Returns:
//   200 { ok: true,  buckets: [...], errors: [] }
//   200 { ok: false, buckets: [...], errors: ['...'] }
//   403 when caller is not authenticated as owner
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse }         from 'next/server'
import { getUserContext }       from '@/lib/auth/getUserContext'
import { checkStorageHealth }   from '@/lib/storage/storageHealth'

export async function GET() {
  // Owner-only gate
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — owner access required' }, { status: 403 })
  }

  const report = await checkStorageHealth()

  return NextResponse.json(report, { status: 200 })
}
