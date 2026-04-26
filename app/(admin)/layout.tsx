export const dynamic = 'force-dynamic'

// app/(admin)/layout.tsx
import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { AdminShell } from '@/components/admin/AdminShell'

export const metadata = { title: 'Platform Admin — ApexCRM' }

/**
 * Owner-only layout guard.
 * Any child route under (admin)/ will redirect to /dashboard?error=forbidden
 * unless the authenticated user holds the 'owner' role.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getUserContext()

  if (!ctx) {
    redirect('/login')
  }

  if (ctx.role !== 'owner') {
    redirect('/dashboard?error=forbidden')
  }

  return (
    <AdminShell email={ctx.email}>
      {children}
    </AdminShell>
  )
}
