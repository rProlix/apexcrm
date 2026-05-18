// app/api/website/templates/[templateId]/route.ts
// GET — returns one template by key
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getTemplate } from '@/lib/website/templates/templateRegistry'

type RouteContext = { params: Promise<{ templateId: string }> }

export async function GET(_req: NextRequest, context: RouteContext) {
  const { templateId } = await context.params
  const template = getTemplate(templateId)
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  return NextResponse.json({ template })
}
