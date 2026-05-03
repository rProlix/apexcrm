// app/(dashboard)/dashboard/360-spins/page.tsx
// Redirects to the canonical 360 Product Viewer dashboard.
// Kept for backwards compatibility with any bookmarked links.
import { redirect } from 'next/navigation'

export default function SpinGeneratorRedirect() {
  redirect('/dashboard/360')
}
