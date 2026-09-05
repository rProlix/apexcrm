import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildGeminiPrompt } from '../prompt'
import { parseGeminiResult } from '../parseGeminiResult'
import { mapSuggestionToSection } from '../sectionMapper'
import { buildRestylePrompt } from '@/lib/website/ai/buildRestylePrompt'
import { normalizeRestylePlan } from '@/lib/website/ai/normalizeRestylePlan'
import { summarizeRestyleSectionContent } from '@/lib/website/ai/restyleContext'
import type { RestyleSectionContext } from '@/lib/website/ai/restyleTypes'

const sectionIds = Array.from(
  { length: 6 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
)

const sections: RestyleSectionContext[] = sectionIds.map((id, index) => ({
  id,
  type: ['hero', 'feature_grid', 'testimonials', 'about', 'faq', 'contact'][index],
  title: ['Book trusted local service', 'Services', 'Customer reviews', 'About', 'FAQ', 'Contact'][
    index
  ],
  sortOrder: index,
  pageId: '10000000-0000-4000-8000-000000000001',
  contentSummary: index === 0 ? { headline: 'Book trusted local service', hasImage: true } : {},
}))

test('autofill prompt plans a complete page without generic AI decoration', () => {
  const prompt = buildGeminiPrompt('Repairs and scheduled service. Call 555-0100.', {
    tenantId: 'tenant',
    tenantName: 'Northline Auto',
    businessType: 'auto_shop',
    businessDescription: 'Independent repair shop',
    hasStore: false,
    siteName: 'Northline Auto',
    existingPages: [{ slug: '', title: 'Home', page_type: 'home' }],
    existingSections: [{ pageSlug: '', sectionType: 'hero', title: 'Local auto repair' }],
    existingProductNames: [],
  })

  assert.match(prompt, /COMPLETE PAGE PLANNING/)
  assert.match(prompt, /one coherent visitor journey/i)
  assert.match(prompt, /Existing sections.*reuse these purposes/i)
  assert.match(prompt, /Do not automatically use purple gradients/i)
  assert.match(prompt, /Do not produce duplicate or near-duplicate suggestions/i)
  assert.doesNotMatch(prompt, /Create a smooth premium layout with seamless section transitions/)
})

test('restyle prompt receives bounded real content and current brand context', () => {
  const prompt = buildRestylePrompt({
    business: {
      businessName: 'Northline Auto',
      businessType: 'auto_shop',
      businessCategory: 'auto_shop',
      description: 'Independent repair shop',
      currentTheme: { brandColors: { primary: '#17324d' } },
    },
    sections,
    stylePreset: 'premium_modern',
    customPrompt: 'Keep our navy color.',
    intensity: 'balanced',
    preserveImages: true,
    generateImageSuggestions: true,
    applyAnimations: true,
    mobileFirst: true,
  })

  assert.match(prompt, /Book trusted local service/)
  assert.match(prompt, /#17324d/)
  assert.match(prompt, /Keep our navy color/)
  assert.match(prompt, /Preserve every existing image/)
  assert.match(prompt, /Do not claim unsupported structural changes/)
  assert.doesNotMatch(prompt, /must not look like stacked square blocks/i)
})

test('section context is compact and does not expose image or storage URLs', () => {
  const summary = summarizeRestyleSectionContent({
    headline: '  A clear headline  ',
    body: 'A '.repeat(500),
    backgroundImage: 'https://private.example/signed-token',
    experienceVersionId: 'secret-storage-pointer',
    items: Array.from({ length: 8 }, (_, index) => ({
      title: `Service ${index + 1}`,
      description: 'Useful detail',
      internalId: `private-${index}`,
    })),
  })

  assert.equal(summary.headline, 'A clear headline')
  assert.equal(summary.hasImage, true)
  assert.equal(summary.itemCount, 8)
  assert.equal((summary.itemPreview as Array<unknown>).length, 6)
  assert.equal(JSON.stringify(summary).includes('signed-token'), false)
  assert.equal(JSON.stringify(summary).includes('secret-storage-pointer'), false)
  assert.equal(JSON.stringify(summary).includes('private-'), false)
})

test('restyle normalization deduplicates sections and budgets decorative effects', () => {
  const rawUpgrade = (section: RestyleSectionContext, index: number) => ({
    sectionId: section.id,
    sectionType: section.type,
    layoutVariant: index === 0 ? 'asymmetric_split' : 'default',
    design: {
      backgroundType: index < 4 ? 'gradient' : 'glass',
      backgroundValue: 'linear-gradient(180deg, #17324d, #244f73)',
      textColor: '#ffffff',
      subtextColor: '#f2f5f7',
      dividerTop: 'wave',
      dividerBottom: 'wave',
      cardStyle: 'floating',
      imageTreatment: 'rounded',
      spacing: 'balanced',
      shadow: 'premium',
      borderRadius: 'large',
      overlay: { enabled: false, type: 'gradient', value: '', opacity: 0 },
    },
  })

  const result = normalizeRestylePlan(
    {
      summary: 'Refined design',
      sectionUpgrades: [
        rawUpgrade(sections[0], 0),
        rawUpgrade(sections[0], 0),
        ...sections.slice(1).map(rawUpgrade),
      ],
    },
    { availableSections: sections, businessCategory: 'auto_shop' }
  )

  assert.equal(result.error, null)
  assert.ok(result.plan)
  assert.equal(result.plan.sectionUpgrades.length, sections.length)
  assert.equal(
    new Set(result.plan.sectionUpgrades.map((upgrade) => upgrade.sectionId)).size,
    sections.length
  )
  assert.ok(
    result.plan.warnings.some((warning) => warning.includes('Duplicate AI upgrade ignored'))
  )
  assert.ok(
    result.plan.sectionUpgrades.filter((upgrade) => upgrade.design.backgroundType === 'gradient')
      .length <= 2
  )
  assert.ok(
    result.plan.sectionUpgrades.filter((upgrade) => upgrade.design.backgroundType === 'glass')
      .length <= 1
  )
  assert.ok(
    result.plan.sectionUpgrades.filter((upgrade) => upgrade.design.dividerBottom !== 'none')
      .length <= 2
  )
  assert.ok(result.plan.sectionUpgrades.every((upgrade) => upgrade.design.borderRadius === 'none'))
  assert.ok(result.plan.sectionUpgrades.every((upgrade) => upgrade.design.shadow === 'none'))
})

test('supported CTA, gallery and cinematic suggestions stay supported after parsing', () => {
  const parsed = parseGeminiResult(
    JSON.stringify({
      summary: 'Ready',
      detectedBusinessType: 'auto_shop',
      detectedContentTypes: ['cta', 'gallery'],
      overallConfidence: 0.9,
      warnings: [],
      missingInfoQuestions: [],
      suggestions: [
        {
          type: 'cta',
          action: 'create',
          confidence: 0.9,
          title: 'Final CTA',
          reason: 'Clear next step',
          data: {},
          proposedSection: {
            headline: 'Book your service',
            body: 'Choose a time that works for you.',
            ctaLabel: 'Book service',
            ctaHref: '/contact',
          },
        },
        {
          type: 'scroll_experience',
          action: 'create',
          confidence: 0.8,
          title: 'Cinematic story',
          reason: 'Requested source video',
          data: {},
          proposedSection: {},
        },
      ],
    })
  )

  assert.equal(parsed.result?.suggestions[0].type, 'cta')
  assert.equal(parsed.result?.suggestions[1].type, 'scroll_experience')

  const cta = mapSuggestionToSection(parsed.result!.suggestions[0])
  assert.equal(cta.section_type, 'cta')
  assert.deepEqual(cta.content, {
    headline: 'Book your service',
    body: 'Choose a time that works for you.',
    ctaLabel: 'Book service',
    ctaHref: '/contact',
    align: 'center',
  })

  const gallery = mapSuggestionToSection({
    type: 'gallery',
    action: 'create',
    confidence: 1,
    title: 'Gallery',
    reason: 'Supplied photos',
    data: {},
    proposedSection: {
      type: 'image_gallery',
      heading: 'Recent work',
      images: [{ url: '/work/one.jpg', alt: 'Completed repair' }],
      layout: 'masonry',
    },
  })
  assert.equal(gallery.section_type, 'image_gallery')
})

test('restyle apply and contact rendering preserve their real execution boundaries', () => {
  const applyRoute = readFileSync('app/api/website/ai/restyle/apply/route.ts', 'utf8')
  const drawer = readFileSync('components/builder/AiRestyleDrawer.tsx', 'utf8')
  const frame = readFileSync('components/site/PremiumSectionFrame.tsx', 'utf8')
  const contact = readFileSync('components/site/sections/ContactSection.tsx', 'utf8')

  assert.match(applyRoute, /pageId: z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/)
  assert.match(applyRoute, /sectionsQuery = sectionsQuery\.eq\('page_id', pageId\)/)
  assert.match(drawer, /pageId: pageId \|\| null/)
  assert.doesNotMatch(frame, /padding: isHero \? undefined : padding/)
  assert.match(frame, /'--section-padding-desk': padding/)
  assert.match(contact, /c\.showForm === true && Boolean\(email\)/)
  assert.match(contact, /window\.location\.href = `mailto:/)
})
