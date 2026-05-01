import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import '@/app/globals.css'

// Fail fast in development: log whether the required Supabase env vars are
// present so the developer sees a clear warning in the server console instead
// of the cryptic "@supabase/ssr: URL and key are required" runtime error.
if (process.env.NODE_ENV === 'development') {
  const missing: string[] = []
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)      missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)     missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) {
    console.warn(
      '\n⚠  Missing Supabase environment variables:\n' +
      missing.map(v => `   ${v}`).join('\n') +
      '\n   Add them to .env.local and to Vercel → Settings → Environment Variables.\n'
    )
  }
}

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title:       'ApexCRM',
  description: 'Multi-tenant white-labeled SaaS CRM platform',
  robots:      { index: false, follow: false },
}

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-graphite-950 text-white antialiased">
        {children}
      </body>
    </html>
  )
}
