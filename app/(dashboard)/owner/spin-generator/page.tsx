// app/(dashboard)/owner/spin-generator/page.tsx
// Owner-only admin page for creating and managing 360 spin packages.

import { redirect }       from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import SpinGeneratorForm  from '@/components/spin-packages/SpinGeneratorForm'

export const metadata = { title: '360 Spin Generator · Owner' }

export default async function SpinGeneratorPage() {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') redirect('/dashboard?error=forbidden')

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
            <svg
              className="h-5 w-5 text-white"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
            >
              <path
                strokeLinecap="round" strokeLinejoin="round"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
              <path
                strokeLinecap="round" strokeLinejoin="round"
                d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">360° Spin Generator</h1>
        </div>
        <p className="text-sm text-zinc-400 ml-12">
          Generate consistent AI product spin sets and attach them to products as interactive 360° viewers.
        </p>
      </div>

      {/* How it works callout */}
      <div className="mb-6 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
        <h2 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">How it works</h2>
        <ol className="space-y-1 text-xs text-zinc-400 list-decimal list-inside">
          <li>Select a business and a product</li>
          <li>Describe the product — be detailed for best consistency</li>
          <li>Choose frame count (24 = 15° increments, 36 = 10°)</li>
          <li>Click <strong className="text-white">Create Package</strong>, then <strong className="text-white">Generate 360 Spin</strong></li>
          <li>Once ready, assign the package to the product — customers see the viewer instantly</li>
        </ol>
      </div>

      {/* Main form */}
      <SpinGeneratorForm />
    </div>
  )
}
