import { NextResponse } from 'next/server'
import { resolvePlatformOwnerAccess } from '@/lib/auth/platform-owner'
import {
  auditInfrastructureAction,
  getRedactedInfrastructureStatus,
} from '@/lib/server/infrastructure/status'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await resolvePlatformOwnerAccess()
  if (!access.ok) {
    if (access.context) {
      await auditInfrastructureAction(
        access.context.id,
        'infrastructure_configuration.access_rejected',
        { endpoint: 'van_damage_health' }
      )
    }
    return NextResponse.json({ error: access.error }, { status: access.status })
  }
  const status = getRedactedInfrastructureStatus()
  await auditInfrastructureAction(
    access.context.id,
    'infrastructure_configuration.health_checked',
    {
      healthy: status.ok,
    }
  )
  return NextResponse.json(status)
}
