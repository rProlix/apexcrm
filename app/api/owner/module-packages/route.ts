import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getUserContext } from '@/lib/auth/getUserContext'
import {
  CANONICAL_MODULE_KEYS,
  listOwnerModulePackages,
  saveOwnerModulePackage,
} from '@/lib/module-packages/service'
import { validateModulePackageInput } from '@/lib/module-packages/policy'

async function requireOwner() {
  const user = await getUserContext()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (user.role !== 'owner') {
    return {
      response: NextResponse.json({ error: 'Platform owner access required.' }, { status: 403 }),
    }
  }
  return { user }
}

export async function GET() {
  const auth = await requireOwner()
  if ('response' in auth) return auth.response

  try {
    return NextResponse.json({ packages: await listOwnerModulePackages({ includeArchived: true }) })
  } catch {
    return NextResponse.json({ error: 'Could not load module packages.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner()
  if ('response' in auth) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const validation = validateModulePackageInput(body, CANONICAL_MODULE_KEYS)
  if (!validation.ok || !validation.value) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  try {
    const id = await saveOwnerModulePackage(validation.value, auth.user.id)
    revalidatePath('/owner/packages')
    return NextResponse.json({ id }, { status: validation.value.id ? 200 : 201 })
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('slug')
        ? error.message
        : 'Could not save module package.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
