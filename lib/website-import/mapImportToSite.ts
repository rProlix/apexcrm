// lib/website-import/mapImportToSite.ts
// Maps NormalizedImportContent into a DraftSiteConfig ready for the website builder.

import type {
  NormalizedImportContent,
  DraftSiteConfig,
  DraftPage,
  DraftSection,
} from './types'

// ── Section builders ──────────────────────────────────────────────────────────

function buildHeroSection(content: NormalizedImportContent, order: number): DraftSection {
  const heroImage = content.images[0]?.url ?? content.logoUrl ?? ''
  return {
    section_type: 'hero',
    section_key:  'hero_main',
    sort_order:   order,
    content: {
      headline:       content.businessName ?? 'Welcome',
      subheadline:    content.tagline ?? content.description?.slice(0, 180) ?? '',
      ctaLabel:       'Get Started',
      ctaHref:        '/contact',
      ctaSecondaryLabel: 'Learn More',
      ctaSecondaryHref:  '/about',
      backgroundImage:  heroImage,
      overlay:          !!heroImage,
      overlayOpacity:   50,
      align:            'center',
    },
  }
}

function buildAboutSection(content: NormalizedImportContent, order: number): DraftSection {
  return {
    section_type: 'about',
    section_key:  'about_main',
    sort_order:   order,
    content: {
      headline: `About ${content.businessName ?? 'Us'}`,
      body:     content.description ?? 'Learn more about our business and what makes us unique.',
      image:    content.images[1]?.url ?? content.logoUrl ?? undefined,
    },
  }
}

function buildServicesSection(content: NormalizedImportContent, order: number): DraftSection {
  return {
    section_type: 'feature_grid',
    section_key:  'services_grid',
    sort_order:   order,
    content: {
      headline: 'Our Services',
      subtitle: content.priceRange ? `Price range: ${content.priceRange}` : '',
      columns:  content.services.length >= 4 ? 3 : 2,
      items:    content.services.slice(0, 6).map((s) => ({
        title:       s.title,
        description: s.description || `Professional ${s.title.toLowerCase()} service.`,
      })),
    },
  }
}

function buildTestimonialsSection(
  content: NormalizedImportContent,
  order: number,
): DraftSection {
  return {
    section_type: 'testimonials',
    section_key:  'testimonials_main',
    sort_order:   order,
    content: {
      headline: 'What Our Customers Say',
      items:    content.testimonials.slice(0, 6).map((t) => ({
        name:   t.name,
        text:   t.text,
        rating: t.rating,
      })),
    },
  }
}

function buildFaqSection(content: NormalizedImportContent, order: number): DraftSection {
  return {
    section_type: 'faq',
    section_key:  'faq_main',
    sort_order:   order,
    content: {
      headline: 'Frequently Asked Questions',
      items:    content.faqItems.slice(0, 12),
    },
  }
}

function buildContactSection(content: NormalizedImportContent, order: number): DraftSection {
  return {
    section_type: 'contact',
    section_key:  'contact_main',
    sort_order:   order,
    content: {
      headline: 'Get In Touch',
      body:     content.address?.full
        ? `Visit us at ${content.address.full}`
        : 'We\'d love to hear from you.',
      email:    content.email ?? undefined,
      phone:    content.phone ?? undefined,
      address:  content.address?.full ?? undefined,
      showForm: true,
      hours:    content.hours.length > 0 ? content.hours.join(' | ') : undefined,
      mapUrl:   content.mapUrl ?? undefined,
    },
  }
}

function buildGallerySection(content: NormalizedImportContent, order: number): DraftSection {
  return {
    section_type: 'image_gallery',
    section_key:  'gallery_main',
    sort_order:   order,
    content: {
      headline: 'Gallery',
      images:   content.images.slice(0, 12).map((img) => ({
        url: img.url,
        alt: img.alt ?? content.businessName ?? 'Image',
      })),
      layout: 'grid',
    },
  }
}

function buildCtaSection(content: NormalizedImportContent, order: number): DraftSection {
  return {
    section_type: 'cta',
    section_key:  'cta_bottom',
    sort_order:   order,
    content: {
      headline: `Ready to work with ${content.businessName ?? 'us'}?`,
      body:     'Contact us today and let\'s get started.',
      ctaLabel: 'Contact Us',
      ctaHref:  '/contact',
      align:    'center',
    },
  }
}

// ── Page builders ─────────────────────────────────────────────────────────────

function buildHomePage(content: NormalizedImportContent): DraftPage {
  const sections: DraftSection[] = []
  let order = 0

  sections.push(buildHeroSection(content, order++))

  if (content.description || content.businessName) {
    sections.push(buildAboutSection(content, order++))
  }

  if (content.services.length > 0) {
    sections.push(buildServicesSection(content, order++))
  }

  if (content.testimonials.length > 0) {
    sections.push(buildTestimonialsSection(content, order++))
  }

  if (content.images.length >= 3) {
    sections.push(buildGallerySection(content, order++))
  }

  sections.push(buildCtaSection(content, order++))

  return {
    slug:             '',
    title:            'Home',
    page_type:        'home',
    meta_description: content.seoDescription ?? content.description?.slice(0, 160) ?? null,
    sections,
  }
}

function buildAboutPage(content: NormalizedImportContent): DraftPage {
  const sections: DraftSection[] = []
  let order = 0

  sections.push(buildAboutSection(content, order++))

  if (content.images.length >= 2) {
    sections.push(buildGallerySection(content, order++))
  }

  sections.push(buildCtaSection(content, order++))

  return {
    slug:             'about',
    title:            'About',
    page_type:        'about',
    meta_description: `Learn more about ${content.businessName ?? 'our business'}.`,
    sections,
  }
}

function buildContactPage(content: NormalizedImportContent): DraftPage {
  return {
    slug:             'contact',
    title:            'Contact',
    page_type:        'contact',
    meta_description: `Contact ${content.businessName ?? 'us'} — ${content.phone ?? content.email ?? ''}`.trim(),
    sections:         [buildContactSection(content, 0)],
  }
}

function buildFaqPage(content: NormalizedImportContent): DraftPage {
  return {
    slug:             'faq',
    title:            'FAQ',
    page_type:        'faq',
    meta_description: `Frequently asked questions about ${content.businessName ?? 'our services'}.`,
    sections:         [buildFaqSection(content, 0)],
  }
}

// ── Site settings builder ─────────────────────────────────────────────────────

function buildSiteSettings(content: NormalizedImportContent): DraftSiteConfig['settings'] {
  const brandColors = content.brandColors
    ? {
        primary:    content.brandColors.primary,
        accent:     content.brandColors.accent,
        background: '#0a0a0a',
        surface:    '#141414',
        text:       '#ffffff',
        muted:      '#888888',
        border:     '#2a2a2a',
      }
    : {
        primary:    '#d4af37',
        accent:     '#c9a227',
        background: '#0a0a0a',
        surface:    '#141414',
        text:       '#ffffff',
        muted:      '#888888',
        border:     '#2a2a2a',
      }

  const socials: Record<string, string> = {}
  for (const [k, v] of Object.entries(content.socialLinks)) {
    if (v) socials[k] = v
  }

  return {
    site_name:   content.businessName,
    logo_url:    content.logoUrl,
    favicon_url: content.faviconUrl,
    brand_colors: brandColors,
    seo_defaults: {
      title:       content.seoTitle ?? content.businessName ?? undefined,
      description: content.seoDescription ?? content.description?.slice(0, 160) ?? undefined,
    },
    footer_config: {
      showLogo:    true,
      tagline:     content.tagline ?? undefined,
      copyright:   `© ${new Date().getFullYear()} ${content.businessName ?? 'All rights reserved'}`,
      showSocials: Object.keys(socials).length > 0,
      socials:     Object.keys(socials).length > 0 ? socials : undefined,
    },
  }
}

// ── Main mapper ───────────────────────────────────────────────────────────────

/**
 * Converts normalized import content into a full DraftSiteConfig.
 * All pages are created with status 'draft' — never published automatically.
 */
export function mapImportToSite(content: NormalizedImportContent): DraftSiteConfig {
  const pages: DraftPage[] = []

  pages.push(buildHomePage(content))

  if (content.description && content.description.length > 50) {
    pages.push(buildAboutPage(content))
  }

  if (content.phone || content.email || content.address) {
    pages.push(buildContactPage(content))
  }

  if (content.faqItems.length >= 2) {
    pages.push(buildFaqPage(content))
  }

  return {
    settings: buildSiteSettings(content),
    pages,
  }
}
