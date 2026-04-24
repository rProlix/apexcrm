import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/app/globals.css'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-graphite-950 text-white antialiased">
        {children}
      </body>
    </html>
  )
}
