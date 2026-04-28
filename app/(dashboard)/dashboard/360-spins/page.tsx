export const dynamic = 'force-dynamic'

// app/(dashboard)/dashboard/360-spins/page.tsx
// 360° Product Spin Generator — dashboard page.
// Accessible to owner + admin roles.

import { redirect }           from 'next/navigation'
import { requirePermission }  from '@/lib/auth/requirePermission'
import SpinGeneratorWizard    from '@/components/360-spins/SpinGeneratorWizard'
import { RotateCcw, Zap, Eye } from 'lucide-react'

export const metadata = { title: '360° Spin Generator — ApexCRM' }

export default async function SpinGeneratorPage() {
  const ctx = await requirePermission('use_modules')

  // Only owner and admin may access this page
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    redirect('/dashboard?error=forbidden')
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-900/40">
          <RotateCcw className="h-6 w-6 text-white" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white leading-tight">360° Spin Generator</h1>
          <p className="text-sm text-white/40 mt-1">
            AI-generated product photography — hyper-realistic, multi-angle, customer-draggable.
          </p>
        </div>
      </div>

      {/* ── Feature callout ────────────────────────────────────────────────── */}
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
            icon:  RotateCcw,
            color: 'text-indigo-400',
            bg:    'bg-indigo-400/10',
            title: 'True 360°',
            desc:  '12–36 frames at even angular increments for smooth drag-to-rotate on any device',
          },
          {
            icon:  Eye,
            color: 'text-violet-400',
            bg:    'bg-violet-400/10',
            title: 'Live Viewer',
            desc:  'Interactive canvas viewer with scrubber, autoplay & zoom — no video, no plugin',
          },
        ].map(({ icon: Icon, color, bg, title, desc }) => (
          <div key={title} className="rounded-xl bg-graphite-800 border border-graphite-600 p-4">
            <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${bg} mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-sm font-semibold text-white mb-1">{title}</p>
            <p className="text-xs text-white/40 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* ── Wizard ─────────────────────────────────────────────────────────── */}
      <SpinGeneratorWizard />
    </div>
  )
}
