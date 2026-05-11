// app/(dashboard)/appointments/layout.tsx
// Provides persistent sub-navigation across all appointment pages.
// This is a Server Component wrapper — the nav itself is a Client Component.

import { AppointmentsSubNav } from '@/components/appointments/AppointmentsSubNav'

export default function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <AppointmentsSubNav />
      {children}
    </div>
  )
}
