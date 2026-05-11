export const dynamic = 'force-dynamic'

import { redirect }             from 'next/navigation'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { PLAN_CATALOG, MODULE_CATALOG, type CRMPlanKey } from '@/lib/plans/planCatalog'
import { OwnerPlansClient }     from './OwnerPlansClient'

export const metadata = {
  title: 'Plan Management — Owner',
}

export default async function OwnerPlansPage() {
  const sessionClient = await createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  if (!user) redirect('/login')

  const admin = getSupabaseServerClient() as any

  const { data: profile } = await admin
    .from('users')
    .select('role, tenant_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'owner') redirect('/dashboard')

  // Load subscriptions with tenant names
  const { data: subscriptions } = await admin
    .from('subscriptions')
    .select(`
      id,
      tenant_id,
      plan_key,
      status,
      billing_interval,
      trial_ends_at,
      current_period_end,
      created_at,
      tenants (name, slug)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  const plans = (Object.values(PLAN_CATALOG) as typeof PLAN_CATALOG[CRMPlanKey][])
    .sort((a, b) => a.sort_order - b.sort_order)

  return (
    <OwnerPlansClient
      plans={plans}
      modules={MODULE_CATALOG}
      subscriptions={subscriptions ?? []}
    />
  )
}
