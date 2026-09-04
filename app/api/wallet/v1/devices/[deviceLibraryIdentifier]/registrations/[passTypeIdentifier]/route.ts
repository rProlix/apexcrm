import { NextRequest, NextResponse } from 'next/server'
import { getUpdatedSerialNumbers } from '@/lib/rewards/wallet/registrations'
import {
  getAppleWalletConfigurationStatus,
  getAppleWalletSigningConfiguration,
} from '@/lib/rewards/wallet/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ deviceLibraryIdentifier: string; passTypeIdentifier: string }> }

export async function GET(request: NextRequest, context: Context) {
  if (!getAppleWalletConfigurationStatus().configured)
    return new NextResponse(null, { status: 503 })
  const params = await context.params
  if (params.passTypeIdentifier !== getAppleWalletSigningConfiguration().passTypeIdentifier) {
    return new NextResponse(null, { status: 404 })
  }
  const updatedSince = Number(request.nextUrl.searchParams.get('passesUpdatedSince') ?? 0)
  const result = await getUpdatedSerialNumbers({
    ...params,
    updatedSince: Number.isFinite(updatedSince) ? updatedSince : 0,
  })
  if (!result || result.serialNumbers.length === 0) return new NextResponse(null, { status: 204 })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
