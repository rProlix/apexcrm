import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getUserContext } from '@/lib/auth/getUserContext'
import { applyOwnerModulePackage } from '@/lib/module-packages/service'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  const user = await getUserContext()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'Platform owner access required.' }, { status: 403 })
  }

  const { packageId } = await params
  if (!UUID_PATTERN.test(packageId)) {
    return NextResponse.json({ error: 'Invalid package ID.' }, { status: 400 })
  }

  let body: { tenantId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (typeof body.tenantId !== 'string' || !UUID_PATTERN.test(body.tenantId)) {
    return NextResponse.json({ error: 'Choose a valid business.' }, { status: 400 })
  }

  try {
    const applicationId = await applyOwnerModulePackage({
      tenantId: body.tenantId,
      packageId,
      actorUserId: user.id,
    })
    revalidatePath('/owner/packages')
    revalidatePath('/owner/modules')
    revalidatePath('/dashboard')
    return NextResponse.json({ success: true, applicationId })
  } catch {
    return NextResponse.json({ error: 'Could not apply this package.' }, { status: 500 })
  }
}
