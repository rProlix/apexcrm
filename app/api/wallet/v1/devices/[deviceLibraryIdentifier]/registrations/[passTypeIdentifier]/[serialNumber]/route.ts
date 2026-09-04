import { NextRequest, NextResponse } from 'next/server'
import { applePassToken, getWalletPassForProtocol } from '@/lib/rewards/wallet/service'
import { registerWalletDevice, unregisterWalletDevice } from '@/lib/rewards/wallet/registrations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = {
  params: Promise<{
    deviceLibraryIdentifier: string
    passTypeIdentifier: string
    serialNumber: string
  }>
}

export async function POST(request: NextRequest, context: Context) {
  const params = await context.params
  const token = applePassToken(request.headers.get('authorization'))
  if (!token) return new NextResponse(null, { status: 401 })
  const pass = await getWalletPassForProtocol(params.passTypeIdentifier, params.serialNumber, token)
  if (!pass) return new NextResponse(null, { status: 401 })
  const body = (await request.json().catch(() => null)) as { pushToken?: unknown } | null
  if (
    typeof body?.pushToken !== 'string' ||
    body.pushToken.length < 16 ||
    body.pushToken.length > 512
  ) {
    return new NextResponse(null, { status: 400 })
  }
  const result = await registerWalletDevice({
    walletPassId: pass.id,
    deviceLibraryIdentifier: params.deviceLibraryIdentifier,
    pushToken: body.pushToken,
  })
  return new NextResponse(null, { status: result === 'created' ? 201 : 200 })
}

export async function DELETE(request: NextRequest, context: Context) {
  const params = await context.params
  const token = applePassToken(request.headers.get('authorization'))
  if (!token) return new NextResponse(null, { status: 401 })
  const pass = await getWalletPassForProtocol(params.passTypeIdentifier, params.serialNumber, token)
  if (!pass) return new NextResponse(null, { status: 401 })
  await unregisterWalletDevice(pass.id, params.deviceLibraryIdentifier)
  return new NextResponse(null, { status: 200 })
}
