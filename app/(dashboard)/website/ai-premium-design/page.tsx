// app/(dashboard)/website/ai-premium-design/page.tsx
// AI Premium Design & Animations dashboard page.
// Business users can generate AI animation plans, apply them globally or per section,
// and manually control animation/style presets.

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { PremiumDesignPanel } from '@/components/website/premium/PremiumDesignPanel'

export default async function AiPremiumDesignPage() {
  const ctx = await getUserContext()
  if (!ctx) redirect('/login')
  if (!['owner', 'admin'].includes(ctx.role)) redirect('/dashboard')

  const supabase  = getSupabaseServerClient()

  // Resolve tenant
  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('auth_user_id', ctx.auth_id)
    .in('role', ['owner', 'admin'])
    .single()

  if (!userRow?.tenant_id) redirect('/dashboard')
  const tenantId = userRow.tenant_id

  // Check website module enabled
  const { data: mod } = await supabase
    .from('tenant_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('module_key', 'website')
    .maybeSingle()

  if (mod && !mod.enabled && ctx.role !== 'owner') redirect('/dashboard')

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-11 w-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl">
            ✦
          </div>
          <div>
            <h1 className="text-xl font-bold text-white/90">AI Premium Design</h1>
            <p className="text-sm text-white/40 mt-0.5">Powered by Gemini · Framer Motion</p>
          </div>
        </div>
        <p className="text-sm text-white/50 leading-relaxed max-w-xl">
          Generate luxury animations, premium UI styles, and conversion-focused motion design for your business website.
          One click — your site goes from plain to polished.
        </p>
      </div>

      {/* Feature callouts */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { icon: '⚡', label: 'AI-generated plan', desc: 'Gemini analyzes your business' },
          { icon: '✦', label: 'Premium presets', desc: '16 animation + 12 style presets' },
          { icon: '♿', label: 'Always accessible', desc: 'Reduced motion respected' },
        ].map(f => (
          <div key={f.label} className="rounded-2xl bg-white/3 border border-white/8 p-4 text-center">
            <div className="text-2xl mb-2">{f.icon}</div>
            <p className="text-xs font-semibold text-white/70">{f.label}</p>
            <p className="text-2xs text-white/30 mt-0.5 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="rounded-2xl bg-white/3 border border-white/8 px-5 py-4 mb-8">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">How it works</p>
        <ol className="space-y-2">
          {[
            'Choose a design vibe that matches your brand',
            'Click Generate Premium Design Plan',
            'AI analyzes your business, sections, and brand colors',
            'Review the plan — toggle animations on/off',
            'Click Apply to Website to make it live',
            'Or manually pick animation presets section by section',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-white/50">
              <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 text-2xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Main panel */}
      <div className="rounded-2xl bg-white/3 border border-white/8 px-6 py-6">
        <PremiumDesignPanel tenantId={tenantId} />
      </div>

      {/* Info footer */}
      <div className="mt-6 px-4 py-3 rounded-xl bg-white/2 border border-white/5 text-2xs text-white/25 leading-relaxed">
        <strong className="text-white/40">In the visual editor:</strong> Select any section on your live website preview, then expand
        the <strong className="text-white/40">✦ AI Premium Design</strong> panel in the right sidebar for per-section controls.
        Animations apply when your site is viewed by visitors — not in draft editor mode.
      </div>
    </div>
  )
}
