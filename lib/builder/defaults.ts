// lib/builder/defaults.ts — Default content + metadata for every section type

import type { SectionTypeDef } from './types'

export const SECTION_TYPES: SectionTypeDef[] = [
  {
    type:  'hero',
    label: 'Hero Banner',
    description: 'Large headline with background and call-to-action button',
    icon:  '🌟',
    defaultContent: {
      headline:       'Welcome to Our Store',
      subheadline:    'Discover premium products curated just for you.',
      ctaLabel:       'Shop Now',
      ctaHref:        '/shop',
      overlay:        true,
      overlayOpacity: 40,
      align:          'center',
    },
  },
  {
    type:  'feature_grid',
    label: 'Feature Grid',
    description: 'Highlight key features or services',
    icon:  '⚡',
    defaultContent: {
      headline: 'Why Choose Us',
      subtitle: '',
      columns:  3,
      items: [
        { title: 'Quality',  description: 'Premium materials and craftsmanship.' },
        { title: 'Speed',    description: 'Fast shipping on every order.' },
        { title: 'Support',  description: '24/7 customer service.' },
      ],
    },
  },
  {
    type:  'product_grid',
    label: 'Product Grid',
    description: 'Display products from your store',
    icon:  '🛍️',
    defaultContent: {
      headline:     'Featured Products',
      subtitle:     '',
      limit:        8,
      showAll:      true,
      allHref:      '/shop',
      filterActive: true,
    },
  },
  {
    type:  'testimonials',
    label: 'Testimonials',
    description: 'Customer reviews and social proof',
    icon:  '⭐',
    defaultContent: {
      headline: 'What Our Customers Say',
      items:    [
        { name: 'Alex R.', text: 'Absolutely love the products!', rating: 5 },
        { name: 'Maria C.', text: 'Fast shipping and great quality.', rating: 5 },
      ],
    },
  },
  {
    type:  'faq',
    label: 'FAQ',
    description: 'Frequently asked questions',
    icon:  '❓',
    defaultContent: {
      headline: 'Frequently Asked Questions',
      items: [
        { question: 'How long does shipping take?', answer: 'Standard shipping takes 3–5 business days.' },
        { question: 'What is your return policy?', answer: 'We accept returns within 30 days of purchase.' },
      ],
    },
  },
  {
    type:  'cta',
    label: 'Call to Action',
    description: 'Conversion section with headline and button',
    icon:  '🎯',
    defaultContent: {
      headline: 'Ready to Get Started?',
      body:     'Join thousands of happy customers today.',
      ctaLabel: 'Get Started',
      ctaHref:  '/shop',
      align:    'center',
    },
  },
  {
    type:  'rich_text',
    label: 'Text Block',
    description: 'Free-form text or HTML content',
    icon:  '📝',
    defaultContent: {
      html: '<p>Add your content here. This section supports <strong>rich text</strong>.</p>',
    },
  },
  {
    type:  'banner',
    label: 'Announcement Banner',
    description: 'Promotional or informational strip',
    icon:  '📣',
    defaultContent: {
      text:        'Free shipping on orders over $50!',
      variant:     'promo',
      dismissible: true,
    },
  },
  {
    type:  'about',
    label: 'About Section',
    description: 'Company story or team introduction',
    icon:  '🏢',
    defaultContent: {
      headline: 'About Us',
      body:     'Tell your story here. Share what makes your business special.',
    },
  },
  {
    type:  'contact',
    label: 'Contact',
    description: 'Contact information and form',
    icon:  '📬',
    defaultContent: {
      headline: 'Get In Touch',
      body:     'We\'d love to hear from you.',
      showForm: true,
    },
  },
  {
    type:  'image_gallery',
    label: 'Image Gallery',
    description: 'Photo gallery with multiple layouts',
    icon:  '🖼️',
    defaultContent: {
      images: [],
      layout: 'grid',
    },
  },
]

export const SECTION_TYPE_MAP = new Map(
  SECTION_TYPES.map((t) => [t.type, t]),
)

export function getDefaultContent(type: string): Record<string, unknown> {
  return SECTION_TYPE_MAP.get(type)?.defaultContent ?? {}
}
