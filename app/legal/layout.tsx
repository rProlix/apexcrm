import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { LEGAL_DOCUMENT_ORDER, LEGAL_DOCUMENTS } from '@/lib/legal/policies'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-graphite-950 text-white">
      <header className="sticky top-0 z-[20] border-b border-white/[0.07] bg-graphite-950/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-gold-400/25 bg-gold-400/10">
              <ShieldCheck className="h-4.5 w-4.5 text-gold-400" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-[-0.01em]">
                NexoraNow
              </span>
              <span className="block text-[11px] text-white/40">Trust Center</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/legal"
              className="hidden rounded-lg px-3 py-2 text-xs font-medium text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white sm:inline-flex"
            >
              All policies
            </Link>
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-xs font-semibold text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.07] active:scale-[0.98]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-8 sm:px-6 md:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:py-12">
        <aside className="md:sticky md:top-24 md:h-fit">
          <nav aria-label="Legal documents">
            <p className="mb-3 text-xs font-semibold text-white/35">Legal documents</p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-1">
              {LEGAL_DOCUMENT_ORDER.map((key) => (
                <Link
                  key={key}
                  href={`/legal/${key}`}
                  className="rounded-lg px-3 py-2 text-xs leading-5 text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  {LEGAL_DOCUMENTS[key].shortTitle}
                </Link>
              ))}
            </div>
          </nav>

          <div className="mt-6 hidden border-t border-white/[0.07] pt-5 text-xs leading-5 text-white/30 md:block">
            <p>Versioned policies and consent records for NexoraNow accounts.</p>
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>

      <footer className="border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} NexoraNow. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/legal/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/legal/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/legal/cookie-policy" className="hover:text-white">
              Cookies
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
