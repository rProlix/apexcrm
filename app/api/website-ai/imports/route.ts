// app/api/website-ai/imports/route.ts
// POST /api/website-ai/imports  — create a new import job
// GET  /api/website-ai/imports  — list import jobs

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess, resolveTenantAccess } from '@/lib/website-ai/tenantAccess'
import { checkInputSecurity, sanitizeInput } from '@/lib/website-ai/security'
import type { AiJobSourceType } from '@/lib/website-ai/types'

function forbidden(msg = 'Forbidden') {
  return NextResponse.json({ error: msg }, { status: 403 })
}

const VALID_SOURCE_TYPES = new Set<AiJobSourceType>([
  'mixed','pasted_text','reviews','services','products',
  'menu','business_profile','contact_hours','faq','policies',
])

// ── POST /api/website-ai/imports ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return forbidden('You do not have permission to use AI Autofill for this website.')

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawInput   = typeof body.rawInput === 'string' ? body.rawInput : ''
  const sourceType = typeof body.sourceType === 'string' && VALID_SOURCE_TYPES.has(body.sourceType as AiJobSourceType)
    ? (body.sourceType as AiJobSourceType)
    : 'mixed'

  if (!rawInput.trim()) {
    return NextResponse.json({ error: 'rawInput is required' }, { status: 422 })
  }

  const access = await requireAiAutofillAccess(
    ctx.role === 'owner' ? (body.tenantId as string | null) : null
  )
  if (!access) {
    return forbidden('You do not have permission to use AI Autofill for this website.')
  }

  const { tenantId } = access

  // Security scan before any DB write
  const security = checkInputSecurity(rawInput)
  if (!security.safe) {
    return NextResponse.json({ error: security.reason }, { status: 422 })
  }

  const sanitized = sanitizeInput(rawInput)

  const db = getSupabaseServerClient()
  const { data: job, error } = await db
    .from('website_ai_import_jobs')
    .insert({
      tenant_id:   tenantId,
      created_by:  ctx.auth_id,
      source_type: sourceType,
      raw_input:   sanitized,
      status:      'draft',
      model:       'gemini-3.1-pro-preview',
    })
    .select('*')
    .single()

  if (error || !job) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create job' }, { status: 500 })
  }

  return NextResponse.json({ job }, { status: 201 })
}

// ── GET /api/website-ai/imports ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return forbidden()

  const url        = new URL(req.url)
  const hintTenant = url.searchParams.get('tenantId') ?? url.searchParams.get('tenant_id')
  const tenantId   = resolveTenantAccess(ctx, hintTenant)

  const db = getSupabaseServerClient()

  let query = db
    .from('website_ai_import_jobs')
    .select('id, tenant_id, source_type, status, model, summary, detected_business_type, detected_content_types, confidence, error_message, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (tenantId) {
    query = query.eq('tenant_id', tenantId)
  } else if (ctx.role !== 'owner') {
    return NextResponse.json({ error: 'No tenant resolved' }, { status: 400 })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ jobs: data ?? [] })
}
