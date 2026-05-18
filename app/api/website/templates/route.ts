// app/api/website/templates/route.ts
// GET — returns all active website templates
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAllTemplates } from '@/lib/website/templates/templateRegistry'

export async function GET() {
  const templates = getAllTemplates().map((t) => ({
    key:            t.key,
    name:           t.name,
    description:    t.description,
    category:       t.category,
    layoutType:     t.layoutType,
    animationLevel: t.animationLevel,
    tags:           t.tags,
    features:       t.features,
    bestFor:        t.bestFor,
    icon:           t.icon,
    previewGradient: t.previewGradient,
    sectionCount:   t.sectionBlueprints.length,
  }))

  return NextResponse.json({ templates })
}
