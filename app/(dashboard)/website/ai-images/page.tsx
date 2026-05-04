// app/(dashboard)/website/ai-images/page.tsx
// AI Website Image Builder page — plan & generate images using Imagen 4 Ultra.

import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
import { AiImagesPanel } from '@/components/website/builder/AiImagesPanel'
import type { WebsiteImagePlan } from '@/lib/ai/websiteImageTypes'
import { WEBSITE_IMAGE_MODEL } from '@/lib/ai/websiteImageConfig'

export const dynamic = 'force-dynamic'

export default async function AiImagesPage() {
  const ctx = await getUserContext()
  if (!ctx) redirect('/login')
  if (!['owner', 'admin'].includes(ctx.role)) redirect('/dashboard')

  const access = await requireAiAutofillAccess(null)
  if (!access) redirect('/dashboard')

  const supabase  = getSupabaseServerClient()
  const tenantId  = access.tenantId

  // Check website module enabled
  const { data: mod } = await supabase
    .from('tenant_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('module_key', 'website')
    .maybeSingle()

  if (mod && !mod.enabled && ctx.role !== 'owner') {
    redirect('/dashboard')
  }

  // Load existing plans
  const { data: plans } = await supabase
    .from('website_image_plans')
    .select('*')
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("rejected","disabled")')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10 border border-violet-500/20">
            <span className="text-lg">🖼️</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white/90">AI Website Images</h1>
            <p className="text-sm text-white/40">Powered by {WEBSITE_IMAGE_MODEL}</p>
          </div>
        </div>
        <p className="text-sm text-white/50 mt-3 max-w-xl">
          Gemini analyzes your website structure and creates a visual plan. Imagen 4 Ultra then generates
          premium, commercially-ready images for each section — hero banners, service cards, gallery covers,
          and more — automatically placed into your website draft.
        </p>
      </div>

      <AiImagesPanel
        tenantId={tenantId}
        isOwner={ctx.role === 'owner'}
        initialPlans={(plans ?? []) as WebsiteImagePlan[]}
      />
    </div>
  )
}
