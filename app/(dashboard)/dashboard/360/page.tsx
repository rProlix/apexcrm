// app/(dashboard)/dashboard/360/page.tsx
// Legacy route — redirects to the new canonical 360 Product Studio.
import { redirect } from 'next/navigation'

export default function Dashboard360LegacyPage() {
  redirect('/dashboard/product-360')
}
