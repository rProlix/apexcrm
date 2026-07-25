import { NextRequest, NextResponse } from 'next/server'
import { CommandCenterAccessError, requireCommandCenterContext } from '@/lib/command-center/context'
import type { CommandRecordType } from '@/lib/command-center/experience'
import { loadQuickPeek } from '@/lib/command-center/quickPeek'

const RECORD_TYPES = new Set<CommandRecordType>([
  'vehicle',
  'inspection',
  'maintenance',
  'customer',
  'appointment',
  'order',
  'action',
])

export async function GET(request: NextRequest) {
  try {
    const context = await requireCommandCenterContext('view_dashboard')
    const type = request.nextUrl.searchParams.get('type') as CommandRecordType | null
    const id = request.nextUrl.searchParams.get('id')?.trim()
    if (!type || !RECORD_TYPES.has(type) || !id || id.length > 128) {
      return NextResponse.json({ error: 'Choose a valid record to preview.' }, { status: 400 })
    }
    const record = await loadQuickPeek(context, type, id)
    return NextResponse.json(
      { record },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    )
  } catch (error) {
    const status = error instanceof CommandCenterAccessError ? error.status : 500
    const message =
      error instanceof CommandCenterAccessError
        ? error.message
        : 'This record preview is temporarily unavailable.'
    return NextResponse.json({ error: message }, { status })
  }
}
