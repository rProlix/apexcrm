// lib/builder/sectionTypes.ts — Section type registry for the website builder

export const CANONICAL_SECTION_TYPES = [
  'hero',
  'about',
  'feature_grid',
  'testimonials',
  'faq',
  'contact',
  'product_grid',
  'rich_text',
  'banner',
  'cta',
  'gallery',
  'product_360',
  'custom',
] as const

export type CanonicalSectionType = typeof CANONICAL_SECTION_TYPES[number]

/** Maps raw AI/legacy names to canonical section types */
const SECTION_TYPE_ALIASES: Record<string, CanonicalSectionType> = {
  // Hero variants
  'hero banner':        'hero',
  'hero_banner':        'hero',
  'herobanner':         'hero',
  'banner_hero':        'hero',
  'header':             'hero',

  // About variants
  'about section':      'about',
  'about_section':      'about',
  'aboutsection':       'about',
  'about us':           'about',
  'about_us':           'about',

  // Feature grid variants
  'feature grid':       'feature_grid',
  'feature_grid':       'feature_grid',
  'featuregrid':        'feature_grid',
  'features':           'feature_grid',
  'feature section':    'feature_grid',
  'feature_section':    'feature_grid',

  // Testimonials variants
  'testimonial':        'testimonials',
  'testimonials section': 'testimonials',
  'reviews':            'testimonials',
  'review section':     'testimonials',

  // FAQ variants
  'faq section':        'faq',
  'faq_section':        'faq',
  'faqs':               'faq',
  'frequently asked':   'faq',

  // Contact variants
  'contact section':    'contact',
  'contact_section':    'contact',
  'contactsection':     'contact',
  'contact form':       'contact',

  // Product grid variants
  'product grid':       'product_grid',
  'productgrid':        'product_grid',
  'products':           'product_grid',
  'shop':               'product_grid',

  // Rich text variants
  'rich_text':          'rich_text',
  'richtext':           'rich_text',
  'text':               'rich_text',
  'content':            'rich_text',

  // Banner variants
  'announcement':       'banner',
  'promo banner':       'banner',

  // CTA variants
  'call to action':     'cta',
  'call_to_action':     'cta',

  // Gallery variants
  'image gallery':      'gallery',
  'image_gallery':      'gallery',
  'photo gallery':      'gallery',

  // 360 viewer variants
  'product_360_viewer': 'product_360',
  'product360viewer':   'product_360',
  '360_viewer':         'product_360',
  '360 viewer':         'product_360',
  'product360':         'product_360',
}

/** Normalise a raw section type string to a canonical type */
export function normalizeSectionType(input: string): CanonicalSectionType {
  if (!input) return 'custom'
  const lower = input.toLowerCase().trim()
  if (CANONICAL_SECTION_TYPES.includes(lower as CanonicalSectionType)) {
    return lower as CanonicalSectionType
  }
  return SECTION_TYPE_ALIASES[lower] ?? 'custom'
}

/** Human-readable display name for a section type */
export function getSectionDisplayName(type: string): string {
  const canonical = normalizeSectionType(type)
  const names: Record<CanonicalSectionType, string> = {
    hero:          'Hero Banner',
    about:         'About',
    feature_grid:  'Feature Grid',
    testimonials:  'Testimonials',
    faq:           'FAQ',
    contact:       'Contact',
    product_grid:  'Product Grid',
    rich_text:     'Rich Text',
    banner:        'Banner',
    cta:           'Call to Action',
    gallery:       'Gallery',
    product_360:   '360° Product Viewer',
    custom:        'Custom Section',
  }
  return names[canonical] ?? type
}

/** Icon emoji for a section type (used in section list) */
export function getSectionIconName(type: string): string {
  const canonical = normalizeSectionType(type)
  const icons: Record<CanonicalSectionType, string> = {
    hero:          '🏠',
    about:         '👤',
    feature_grid:  '⚡',
    testimonials:  '💬',
    faq:           '❓',
    contact:       '✉️',
    product_grid:  '🛍️',
    rich_text:     '📝',
    banner:        '📣',
    cta:           '🎯',
    gallery:       '🖼️',
    product_360:   '🔄',
    custom:        '🧩',
  }
  return icons[canonical] ?? '📄'
}

/** Returns true for section types that have known renderers */
export function isSupportedSectionType(type: string): boolean {
  return normalizeSectionType(type) !== 'custom'
}

/** Default content for each section type (used when creating new sections) */
export function getDefaultSectionContent(type: string): Record<string, unknown> {
  const canonical = normalizeSectionType(type)
  const defaults: Record<CanonicalSectionType, Record<string, unknown>> = {
    hero: {
      headline: 'Welcome to Our Business',
      subheading: 'We provide exceptional services tailored for you.',
      cta_text: 'Get Started',
      cta_url: '#contact',
      background_color: '#1a1a2e',
      text_color: '#ffffff',
    },
    about: {
      title: 'About Us',
      description: 'Tell your story here. Share your mission, values, and what makes your business unique.',
      image_url: null,
    },
    feature_grid: {
      title: 'Why Choose Us',
      subtitle: 'Here are the key features that set us apart.',
      features: [
        { icon: '⚡', title: 'Fast & Reliable', description: 'We deliver results quickly and consistently.' },
        { icon: '🛡️', title: 'Trusted & Secure', description: 'Your data and privacy are always protected.' },
        { icon: '💡', title: 'Innovative', description: 'We stay ahead with cutting-edge solutions.' },
      ],
    },
    testimonials: {
      title: 'What Our Clients Say',
      testimonials: [
        { name: 'Jane D.', quote: 'Amazing service! Highly recommended.', rating: 5 },
        { name: 'John S.', quote: 'Professional team, great results.', rating: 5 },
      ],
    },
    faq: {
      title: 'Frequently Asked Questions',
      faqs: [
        { question: 'How do I get started?', answer: 'Simply contact us and we will guide you through the process.' },
        { question: 'What are your hours?', answer: 'We are available Monday–Friday, 9am–6pm.' },
      ],
    },
    contact: {
      title: 'Contact Us',
      subtitle: 'Have a question? We would love to hear from you.',
      show_phone: true,
      show_email: true,
      show_address: true,
      cta_text: 'Send Message',
    },
    product_grid: {
      title: 'Our Products',
      subtitle: 'Browse our collection.',
      limit: 8,
      show_prices: true,
    },
    rich_text: {
      content: '<p>Enter your content here. Use the editor to format text, add links, and more.</p>',
    },
    banner: {
      message: 'Special offer! Use code WELCOME10 for 10% off your first order.',
      background_color: '#c9a84c',
      text_color: '#000000',
      dismissable: true,
    },
    cta: {
      title: 'Ready to Get Started?',
      subtitle: 'Join hundreds of satisfied customers today.',
      primary_cta_text: 'Get Started',
      primary_cta_url: '#contact',
      secondary_cta_text: 'Learn More',
      secondary_cta_url: '#about',
    },
    gallery: {
      title: 'Gallery',
      images: [],
      columns: 3,
    },
    product_360: {
      title: '360° Product Viewer',
      product_id: null,
    },
    custom: {
      html: '',
    },
  }
  return defaults[canonical] ?? {}
}
