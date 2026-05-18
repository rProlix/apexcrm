// components/site/TemplateRenderer.tsx
// Routes sections through the correct template layout component based on activeTemplateKey.
// Server component — client-specific template components are lazy-loaded.

import dynamic from 'next/dynamic'
import { SafeSectionRenderer } from './SafeSectionRenderer'

// Lazy-load client-side template components.
// ssr: false is NOT allowed in Server Components — these components guard
// browser APIs with useEffect + state, so SSR renders a safe placeholder.
const ParallaxOnePage = dynamic(
  () => import('./premium/ParallaxOnePage').then((m) => m.ParallaxOnePage),
)
const ProductStoryScroll = dynamic(
  () => import('./premium/ProductStoryScroll').then((m) => m.ProductStoryScroll),
)

interface RawSection {
  id:           string
  section_type: string
  is_visible?:  boolean
  sort_order?:  number | null
  content?:     Record<string, unknown>
  style_config?: Record<string, unknown> | null
  animation_config?: Record<string, unknown> | null
}

interface Props {
  activeTemplateKey?: string | null
  sections:          RawSection[]
  tenantId:          string
  mode?:             'public' | 'preview' | 'editor'
  templateConfig?:   Record<string, unknown>
}

// ── Template-specific scene extraction ───────────────────────────────────────

function extractProductScenes(sections: RawSection[]) {
  const hero = sections.find((s) => s.section_type === 'hero')
  const featureGrid = sections.find((s) => s.section_type === 'feature_grid')

  const scenes = []
  if (hero?.content) {
    scenes.push({
      headline:    (hero.content.headline as string) || 'Our Featured Product',
      description: (hero.content.subheadline as string) || 'Experience the difference.',
    })
  }
  if (featureGrid?.content) {
    const items = (featureGrid.content.items as Array<{ title?: string; description?: string }>) ?? []
    for (const item of items.slice(0, 3)) {
      if (item.title) scenes.push({ headline: item.title, description: item.description ?? '' })
    }
  }

  const productImageUrl =
    (hero?.content?.backgroundImage as string | undefined) ??
    (hero?.content?.imageUrl as string | undefined) ??
    null

  return { scenes, productImageUrl }
}

// ── Main component ─────────────────────────────────────────────────────────

export async function TemplateRenderer({
  activeTemplateKey,
  sections,
  tenantId,
  mode = 'public',
  templateConfig = {},
}: Props) {
  // Filter visible sections sorted by sort_order
  const visibleSections = sections
    .filter((s) => s.is_visible !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  // ── Parallax One-Page template ────────────────────────────────────────────
  if (activeTemplateKey === 'luxe_one_page_parallax') {
    // Build section data for ParallaxOnePage (SSR-safe placeholder; client renders animations)
    const parallaxSections = visibleSections.map((section) => ({
      id:          section.id,
      sectionType: section.section_type,
      fullHeight:  section.section_type === 'hero',
      children: (
        <SafeSectionRenderer
          key={section.id}
          section={section}
          tenantId={tenantId}
          mode={mode}
        />
      ),
    }))

    return (
      <ParallaxOnePage
        sections={parallaxSections}
        backgroundColor={(templateConfig.backgroundColor as string | undefined) ?? '#0d0d14'}
        textColor={(templateConfig.textColor as string | undefined) ?? '#f5f0e8'}
      />
    )
  }

  // ── Apple-Style Product Story ─────────────────────────────────────────────
  if (activeTemplateKey === 'apple_style_product_story') {
    const { scenes, productImageUrl } = extractProductScenes(visibleSections)

    return (
      <div style={{ background: '#000000' }}>
        <ProductStoryScroll
          stickyProductImageUrl={productImageUrl}
          productStoryScenes={scenes}
          textColor="#f5f5f7"
          backgroundColor="#000000"
        />
        {/* Remaining sections below the scroll stage */}
        {visibleSections
          .filter((s) => !['hero', 'feature_grid'].includes(s.section_type))
          .map((section) => (
            <SafeSectionRenderer
              key={section.id}
              section={section}
              tenantId={tenantId}
              mode={mode}
            />
          ))}
      </div>
    )
  }

  // ── All other templates + default: standard section rendering ─────────────
  return (
    <>
      {await Promise.all(
        visibleSections.map(async (section, index) => (
          <SafeSectionRenderer
            key={`${section.id}-${index}`}
            section={section}
            tenantId={tenantId}
            mode={mode}
            index={index}
          />
        )),
      )}
    </>
  )
}
