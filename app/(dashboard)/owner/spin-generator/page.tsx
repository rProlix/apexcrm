// app/(dashboard)/owner/spin-generator/page.tsx
// Redirects to the canonical 360 Product Viewer dashboard.
// Kept for backwards compatibility with any bookmarked links.
import { redirect } from 'next/navigation'

export default function SpinGeneratorOwnerRedirect() {
  redirect('/dashboard/360')
}
