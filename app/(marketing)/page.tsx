export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createSessionServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function MarketingPage() {
  const supabase = await createSessionServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  return (
    <main className="min-h-dvh bg-graphite-950 flex flex-col items-center justify-center px-6">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 bg-gold-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center max-w-2xl">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-400 text-xs font-semibold mb-8">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-400 animate-pulse-gold" />
          Multi-tenant SaaS CRM Platform
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl font-bold text-white tracking-tight leading-none mb-6">
          Apex
          <span className="text-gold-gradient">CRM</span>
        </h1>

        <p className="text-lg text-white/50 leading-relaxed mb-12 max-w-lg mx-auto">
          A white-labeled CRM platform for modern service businesses. Modular, multi-tenant, and built to scale.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center h-12 px-8 rounded-xl font-semibold bg-gold-gradient text-graphite-900 hover:shadow-glow-gold transition-shadow duration-200"
          >
            Sign in to your CRM
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center h-12 px-8 rounded-xl font-semibold bg-graphite-700 text-white border border-graphite-500 hover:bg-graphite-600 transition-colors duration-150"
          >
            View Dashboard
          </Link>
        </div>

        {/* Tenants showcase */}
        <div className="mt-16 flex flex-wrap gap-3 justify-center">
          {['RentalCo', 'PlumberPro', 'SalonX'].map((name) => (
            <div
              key={name}
              className="px-4 py-2 rounded-xl bg-graphite-800 border border-graphite-600 text-white/40 text-sm"
            >
              {name}
            </div>
          ))}
        </div>
        <p className="mt-3 text-2xs text-white/20 uppercase tracking-widest">
          Example tenants
        </p>
      </div>
    </main>
  )
}
