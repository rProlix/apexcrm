import { NextRequest, NextResponse } from 'next/server'
import { requestCommandAssistant, requestModuleAiAssistant } from '@/lib/command-center/ai'
import { CommandCenterAccessError } from '@/lib/command-center/context'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      moduleKey?: unknown
      questionKey?: unknown
      query?: unknown
    }
    if (typeof body.query === 'string') {
      const result = await requestCommandAssistant({ query: body.query })
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }
    if (typeof body.moduleKey !== 'string' || typeof body.questionKey !== 'string') {
      return NextResponse.json(
        { error: 'Ask a question or choose a module question.' },
        { status: 400 }
      )
    }
    const result = await requestModuleAiAssistant({
      moduleKey: body.moduleKey,
      questionKey: body.questionKey,
    })
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    const status = error instanceof CommandCenterAccessError ? error.status : 400
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'AI insights are temporarily unavailable. Your data is still saved and available for manual review.',
      },
      { status }
    )
  }
}
