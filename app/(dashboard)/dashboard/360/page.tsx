export const dynamic = 'force-dynamic'

// app/(dashboard)/dashboard/360/page.tsx
// 360 Product Spin — owner / admin dashboard.
// Wraps the existing SpinGeneratorWizard with module-specific framing.

import { redirect }          from 'next/navigation'
import { requirePermission } from '@/lib/auth/requirePermission'
import SpinGeneratorWizard   from '@/components/360-spins/SpinGeneratorWizard'
import { ScanLine, Zap, Eye, MousePointer2 } from 'lucide-react'

export const metadata = { title: '360° Product Spin — ApexCRM' }

export default async function Dashboard360Page() {
  const ctx = await requirePermission('use_modules')

  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    redirect('/dashboard?error=forbidden')
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-600 to-violet-700 shadow-lg shadow-fuchsia-900/40">
          <ScanLine className="h-6 w-6 text-white" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white leading-tight">360° Product Spin</h1>
          <p className="text-sm text-white/40 mt-1">
            AI-generated 360° product photography — drag to rotate on any storefront page.
          </p>
        </div>
      </div>

      {/* ── Feature callouts ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            icon:  Zap,
            color: 'text-amber-400',
            bg:    'bg-amber-400/10',
            title: 'AI-Powered',
            desc:  'Consistent Midjourney renders — same lighting, scale, and framing for every frame',
          },
          {
            icon:  MousePointer2,
            color: 'text-fuchsia-400',
            bg:    'bg-fuchsia-400/10',
            title: 'Drag to Spin',
            desc:  'Customers drag left/right to rotate. Touch-optimised for mobile.',
          },
          {
            icon:  Eye,
            color: 'text-violet-400',
            bg:    'bg-violet-400/10',
            title: 'Website Builder',
            desc:  'Drag the "360° Viewer" block into any page — no code needed.',
          },
        ].map(({ icon: Icon, color, bg, title, desc }) => (
          <div key={title} className="rounded-xl bg-zinc-800/60 border border-zinc-700 p-4">
            <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${bg} mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-sm font-semibold text-white mb-1">{title}</p>
            <p className="text-xs text-white/40 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* ── How to use ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-fuchsia-900/40 bg-fuchsia-950/20 p-4">
        <p className="text-xs font-semibold text-fuchsia-400 uppercase tracking-wider mb-3">
          Quick-start guide
        </p>
        <ol className="space-y-2">
          {[
            'Select a business and product below',
            'Describe the product — the AI uses this for consistent renders',
            'Choose frame count (12, 24, or 36)',
            'Click Generate and wait for all frames to complete',
            'Attach the spin to your product',
            'Go to Website Builder → Add Section → 360° Viewer → select product → Publish',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-xs text-white/60">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fuchsia-900/50 text-fuchsia-400 font-bold text-[10px] mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* ── Generator wizard ───────────────────────────────────────── */}
      <SpinGeneratorWizard />
    </div>
  )
}
