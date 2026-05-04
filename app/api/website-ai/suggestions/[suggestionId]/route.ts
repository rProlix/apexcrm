// app/api/website-ai/suggestions/[suggestionId]/route.ts
// PATCH /api/website-ai/suggestions/[suggestionId]
// Updates a suggestion before applying.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess, verifySuggestionAccess } from '@/lib/website-ai/tenantAccess'
import type { AiSuggestionAction, AiSuggestionStatus } from '@/lib/website-ai/types'

type Params = { params: Promise<{ suggestionId: string }> }

const VALID_STATUSES  = new Set<AiSuggestionStatus>(['pending', 'accepted', 'rejected', 'edited'])
const VALID_ACTIONS   = new Set<AiSuggestionAction>(['create', 'update', 'append', 'replace', 'ignore'])

export async function PATCH(req: NextRequest, { params }: Params) {
  const { suggestionId } = await params

  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const access = await requireAiAutofillAccess()
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { tenantId } = access

  if (!(await verifySuggestionAccess(suggestionId, tenantId))) {
    return NextResponse.json({ error: 'Suggestion not found or not accessible.' }, { status: 403 })
  }

  const db = getSupabaseServerClient()

  // Fetch current suggestion
  const { data: suggestion } = await db
    .from('website_ai_suggestions')
    .select('id, status')
    .eq('id', suggestionId)
    .single()

  if (!suggestion) return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
  if (suggestion.status === 'applied') {
    return NextResponse.json({ error: 'Cannot edit an already-applied suggestion.' }, { status: 409 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (typeof body.title === 'string')       updates.title       = body.title.trim()
  if (typeof body.description === 'string') updates.description = body.description.trim()
  if (typeof body.admin_notes === 'string') updates.admin_notes = body.admin_notes.trim()
  if (typeof body.reason === 'string')      updates.reason      = body.reason.trim()

  if (body.status !== undefined) {
    const s = body.status as string
    if (!VALID_STATUSES.has(s as AiSuggestionStatus)) {
      return NextResponse.json({ error: `Invalid status: ${s}` }, { status: 422 })
    }
    updates.status = s
  }

  if (body.action !== undefined) {
    const a = body.action as string
    if (!VALID_ACTIONS.has(a as AiSuggestionAction)) {
      return NextResponse.json({ error: `Invalid action: ${a}` }, { status: 422 })
    }
    updates.action = a
  }

  if (body.extracted_data !== undefined) {
    if (typeof body.extracted_data !== 'object' || Array.isArray(body.extracted_data)) {
      return NextResponse.json({ error: 'extracted_data must be an object' }, { status: 422 })
    }
    updates.extracted_data = body.extracted_data
  }

  if (body.proposed_section !== undefined) {
    if (typeof body.proposed_section !== 'object' || Array.isArray(body.proposed_section)) {
      return NextResponse.json({ error: 'proposed_section must be an object' }, { status: 422 })
    }
    updates.proposed_section = body.proposed_section
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 422 })
  }

  const { data: updated, error } = await db
    .from('website_ai_suggestions')
    .update(updates as never)
    .eq('id', suggestionId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ suggestion: updated })
}
