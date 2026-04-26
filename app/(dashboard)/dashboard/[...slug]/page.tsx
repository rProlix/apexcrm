export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { LayoutDashboard, ArrowLeft } from 'lucide-react'

/**
 * Catch-all for /dashboard/* paths that don't have a dedicated page yet.
 * Renders a helpful "coming soon" UI instead of a blank 404.
 */
export default async function DashboardSubPageNotFound({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const path = `/dashboard/${slug.join('/')}`
  const label = slug
    .at(-1)
    ?.replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'Page'

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gold-500/10 border border-gold-500/20 mb-5">
          <LayoutDashboard className="h-6 w-6 text-gold-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">{label}</h1>
        <p className="text-sm text-white/40 mb-1">
          <code className="text-white/30 text-xs">{path}</code>
        </p>
        <p className="text-sm text-white/40 mb-6">
          This section is coming soon. Check back after the next deployment.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-gold-gradient text-graphite-900 font-semibold text-sm hover:shadow-glow-gold transition-shadow duration-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
