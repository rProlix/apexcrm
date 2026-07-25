import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getUserContext } from '@/lib/auth/getUserContext'
import { archiveOwnerModulePackage } from '@/lib/module-packages/service'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function DELETE(
  _request: Request,
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

  try {
    await archiveOwnerModulePackage(packageId)
    revalidatePath('/owner/packages')
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Could not archive module package.' }, { status: 500 })
  }
}
