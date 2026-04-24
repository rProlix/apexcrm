import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-graphite-950 flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-6xl font-bold text-gold-gradient mb-4">404</p>
        <h1 className="text-xl font-semibold text-white mb-2">Page not found</h1>
        <p className="text-sm text-white/40 mb-8">The page you are looking for does not exist.</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center h-10 px-6 rounded-xl bg-gold-gradient text-graphite-900 font-semibold text-sm hover:shadow-glow-gold transition-shadow duration-200"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  )
}
