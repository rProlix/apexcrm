export const dynamic = 'force-dynamic'

// app/(dashboard)/website/layout.tsx
// Shared layout for all Website Builder pages.
// Adds a persistent horizontal tab navigation between the
// main dashboard sidebar and the page content.

import { getUserContext } from '@/lib/auth/getUserContext'
import { WebsiteBuilderNav } from '@/components/website/WebsiteBuilderNav'

export default async function WebsiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Fetch role to conditionally show owner-only tabs.
  // This is lightweight — getUserContext is cached per request.
  const ctx = await getUserContext()

  return (
    <div className="flex flex-col min-h-0">
      <WebsiteBuilderNav userRole={ctx?.role} />
      <div className="flex-1 pt-6">
        {children}
      </div>
    </div>
  )
}
