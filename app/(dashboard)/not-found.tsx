import Link from 'next/link'

export default function DashboardNotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <p className="text-5xl font-bold text-gold-gradient mb-4">404</p>
        <h1 className="text-lg font-semibold text-white mb-2">Page not found</h1>
        <p className="text-sm text-white/40 mb-6">
          This page doesn't exist or you don't have access to it.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center h-9 px-5 rounded-xl bg-gold-gradient text-graphite-900 font-semibold text-sm hover:shadow-glow-gold transition-shadow duration-200"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
