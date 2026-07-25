import { NextRequest, NextResponse } from 'next/server'
import { CommandCenterAccessError, requireCommandCenterContext } from '@/lib/command-center/context'
import { normalizeCommandQuery } from '@/lib/command-center/experience'
import { searchCommandCenter } from '@/lib/command-center/search'

export async function GET(request: NextRequest) {
  try {
    const context = await requireCommandCenterContext('view_dashboard')
    const query = normalizeCommandQuery(request.nextUrl.searchParams.get('q') ?? '')
    if (query.length < 2) return NextResponse.json({ results: [] })
    const results = await searchCommandCenter(context, query)
    return NextResponse.json(
      { results },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    )
  } catch (error) {
    const status = error instanceof CommandCenterAccessError ? error.status : 500
    const message =
      error instanceof CommandCenterAccessError
        ? error.message
        : 'Command search is temporarily unavailable.'
    return NextResponse.json({ error: message, results: [] }, { status })
  }
}
