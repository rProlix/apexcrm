import { NextRequest, NextResponse } from 'next/server'
import {
  applePassToken,
  getWalletPassForProtocol,
  issueAppleWalletPass,
} from '@/lib/rewards/wallet/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ passTypeIdentifier: string; serialNumber: string }> }

export async function GET(request: NextRequest, context: Context) {
  const params = await context.params
  const token = applePassToken(request.headers.get('authorization'))
  if (!token) return new NextResponse(null, { status: 401 })
  const pass = await getWalletPassForProtocol(params.passTypeIdentifier, params.serialNumber, token)
  if (!pass) return new NextResponse(null, { status: 401 })
  const lastModified = new Date(pass.updated_at)
  const modifiedSince = request.headers.get('if-modified-since')
  if (modifiedSince && new Date(modifiedSince).getTime() >= lastModified.getTime()) {
    return new NextResponse(null, { status: 304 })
  }
  const generated = await issueAppleWalletPass({
    tenantId: pass.tenant_id,
    customerId: pass.customer_id,
    programId: pass.program_id,
  })
  return new NextResponse(new Uint8Array(generated.buffer), {
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Cache-Control': 'no-store',
      'Last-Modified': lastModified.toUTCString(),
    },
  })
}
