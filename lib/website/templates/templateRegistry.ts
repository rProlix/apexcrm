// lib/website/templates/templateRegistry.ts
// In-code registry of all premium website templates.
// Templates are defined here — the DB tracks which is applied per tenant.

import type { WebsiteTemplate } from './templateTypes'

// ── Helper: build a section design object ─────────────────────────────────────

function sd(overrides: Record<string, unknown> = {}) {
  return {
    backgroundType:  'solid',
    backgroundValue: 'var(--ds-bg)',
    textColor:       'var(--ds-text)',
    subtextColor:    'var(--ds-muted)',
    overlay:         { enabled: false, type: 'gradient', value: '', opacity: 0 },
    dividerTop:      'none',
    dividerBottom:   'none',
    cardStyle:       'soft',
    imageTreatment:  'rounded',
    spacing:         'balanced',
    shadow:          'soft',
    borderRadius:    'soft',
    layoutVariant:   'default',
    readability:     { checked: true, textContrast: 'pass', subtextContrast: 'pass', buttonContrast: 'pass', notes: [] },
    ...overrides,
  }
}

// ── Template definitions ──────────────────────────────────────────────────────

export const WEBSITE_TEMPLATES: WebsiteTemplate[] = [

  // ── 1. Luxe One-Page Parallax ─────────────────────────────────────────────
  {
    key:           'luxe_one_page_parallax',
    name:          'Luxe One-Page Parallax',
    description:   'Premium one-page design with smooth scroll storytelling, layered backgrounds, curved section transitions, floating testimonial cards, and parallax movement.',
    category:      'luxury',
    layoutType:    'parallax',
    animationLevel:'cinematic',
    icon:          '✦',
    previewGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
    tags:          ['parallax', 'one-page', 'luxury', 'animated'],
    features:      ['Sticky floating navigation', 'Parallax hero background', 'Curved SVG dividers', 'Animated section reveals', 'Premium testimonial cards', 'Appointment & store CTAs'],
    bestFor:       ['Restaurants', 'Beauty & Spa', 'Local services', 'Premium shops'],
    designSystem: {
      designLevel:  'luxury',
      palette: {
        primary:       '#c9a84c',
        secondary:     '#1a1a2e',
        accent:        '#e8c96b',
        background:    '#0d0d14',
        surface:       '#16161f',
        surfaceAlt:    '#1e1e2a',
        textPrimary:   '#f5f0e8',
        textSecondary: '#c4bfb0',
        mutedText:     '#7a7568',
        border:        '#2a2a3a',
      },
      sectionFlow: { style: 'layered', dividerStyle: 'curve', backgroundStrategy: 'layered_surfaces' },
    } as never,
    sectionBlueprints: [
      { slot: 'hero',         sectionType: 'hero',         required: true,  order: 0, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(180deg, #0d0d14 0%, #1a1a2e 100%)', textColor: '#f5f0e8', subtextColor: 'rgba(245,240,232,0.78)', spacing: 'luxury', dividerBottom: 'curve', overlay: { enabled: true, type: 'gradient', value: 'linear-gradient(to bottom, rgba(13,13,20,0.4) 0%, rgba(13,13,20,0.8) 100%)', opacity: 0.6 } }) as never, layoutVariant: 'fullscreen_center', visualIntent: 'Cinematic luxury hero with parallax depth' },
      { slot: 'about',        sectionType: 'about',        required: false, order: 1, design: sd({ backgroundType: 'solid', backgroundValue: '#16161f', textColor: '#f5f0e8', subtextColor: '#c4bfb0', spacing: 'airy', dividerBottom: 'wave', cardStyle: 'floating' }) as never, layoutVariant: 'split_editorial' },
      { slot: 'feature_grid', sectionType: 'feature_grid', required: false, order: 2, design: sd({ backgroundType: 'layered', backgroundValue: '#1e1e2a', textColor: '#f5f0e8', subtextColor: '#c4bfb0', spacing: 'airy', cardStyle: 'glass', shadow: 'premium' }) as never, layoutVariant: 'cards_3col' },
      { slot: 'testimonials', sectionType: 'testimonials', required: false, order: 3, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #0d0d14 0%, #1a1a2e 100%)', textColor: '#f5f0e8', subtextColor: '#c4bfb0', spacing: 'luxury', cardStyle: 'glass', dividerTop: 'curve', dividerBottom: 'wave' }) as never, layoutVariant: 'carousel_luxury' },
      { slot: 'faq',          sectionType: 'faq',          required: false, order: 4, design: sd({ backgroundType: 'solid', backgroundValue: '#16161f', textColor: '#f5f0e8', spacing: 'airy' }) as never },
      { slot: 'cta',          sectionType: 'cta',          required: true,  order: 5, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #c9a84c 0%, #e8c96b 100%)', textColor: '#0d0d14', subtextColor: '#2a1f00', spacing: 'luxury', dividerTop: 'angle' }) as never, layoutVariant: 'fullwidth_dark' },
      { slot: 'contact',      sectionType: 'contact',      required: false, order: 6, design: sd({ backgroundType: 'solid', backgroundValue: '#0d0d14', textColor: '#f5f0e8', subtextColor: '#7a7568', spacing: 'airy' }) as never },
    ],
  },

  // ── 2. Apple-Style Product Story ─────────────────────────────────────────
  {
    key:           'apple_style_product_story',
    name:          'Apple-Style Product Story',
    description:   'A scroll-driven product showcase where the featured item moves and transforms as you scroll. Premium product storytelling for launches, retail, and restaurants featuring signature items.',
    category:      'product_showcase',
    layoutType:    'product_story',
    animationLevel:'cinematic',
    icon:          '◉',
    previewGradient: 'linear-gradient(135deg, #000000 0%, #1a1a1a 40%, #2d2d2d 100%)',
    tags:          ['product-story', 'scroll', 'animated', 'premium'],
    features:      ['Sticky product stage', 'Scroll-driven product movement', 'Scene-based text reveals', '360° spin support', 'Mobile-safe fallback', 'Cinematic transitions'],
    bestFor:       ['Retail', 'Product launches', 'Restaurants with signature dishes', 'Automotive'],
    designSystem: {
      designLevel:  'premium',
      palette: {
        primary:       '#f5f5f7',
        secondary:     '#1d1d1f',
        accent:        '#2997ff',
        background:    '#000000',
        surface:       '#1d1d1f',
        surfaceAlt:    '#2d2d2d',
        textPrimary:   '#f5f5f7',
        textSecondary: '#a1a1a6',
        mutedText:     '#6e6e73',
        border:        '#3a3a3c',
      },
      typography: {
        headingFontCategory: 'modern',
        bodyFontCategory:    'sans',
        headingFontStack:    '"SF Pro Display", -apple-system, system-ui, sans-serif',
        bodyFontStack:       '"SF Pro Text", -apple-system, system-ui, sans-serif',
        headingWeight:       700,
        bodyWeight:          400,
        letterSpacing:       '-0.02em',
        lineHeight:          '1.6',
      },
      sectionFlow: { style: 'editorial', dividerStyle: 'none', backgroundStrategy: 'layered_surfaces' },
    } as never,
    sectionBlueprints: [
      { slot: 'hero',         sectionType: 'hero',         required: true,  order: 0, design: sd({ backgroundType: 'solid', backgroundValue: '#000000', textColor: '#f5f5f7', subtextColor: '#a1a1a6', spacing: 'luxury' }) as never, layoutVariant: 'product_story_intro', visualIntent: 'Dark cinematic product introduction' },
      { slot: 'feature_grid', sectionType: 'feature_grid', required: false, order: 1, design: sd({ backgroundType: 'solid', backgroundValue: '#000000', textColor: '#f5f5f7', subtextColor: '#a1a1a6', spacing: 'luxury', cardStyle: 'none' }) as never, layoutVariant: 'product_specs' },
      { slot: 'about',        sectionType: 'about',        required: false, order: 2, design: sd({ backgroundType: 'solid', backgroundValue: '#1d1d1f', textColor: '#f5f5f7', spacing: 'airy' }) as never },
      { slot: 'testimonials', sectionType: 'testimonials', required: false, order: 3, design: sd({ backgroundType: 'solid', backgroundValue: '#000000', textColor: '#f5f5f7', subtextColor: '#a1a1a6', cardStyle: 'none', spacing: 'luxury' }) as never },
      { slot: 'cta',          sectionType: 'cta',          required: true,  order: 4, design: sd({ backgroundType: 'solid', backgroundValue: '#000000', textColor: '#f5f5f7', spacing: 'luxury' }) as never, layoutVariant: 'minimal_dark' },
    ],
  },

  // ── 3. Premium Restaurant Glow ────────────────────────────────────────────
  {
    key:           'premium_restaurant_glow',
    name:          'Premium Restaurant Glow',
    description:   'Warm, appetizing restaurant site with cinematic food photography overlays, menu showcase, curved section transitions, reservation CTAs, and review cards.',
    category:      'restaurant',
    layoutType:    'standard',
    animationLevel:'balanced',
    icon:          '🍽',
    previewGradient: 'linear-gradient(135deg, #2c1810 0%, #4a2520 40%, #8b4513 100%)',
    tags:          ['restaurant', 'food', 'warm', 'menu'],
    features:      ['Cinematic hero with food imagery', 'Menu grid section', 'Warm color palette', 'Review carousel', 'Reservation CTA', 'Curved section dividers'],
    bestFor:       ['Restaurants', 'Cafés', 'Food trucks', 'Catering'],
    designSystem: {
      designLevel: 'warm',
      palette: {
        primary:       '#c9571a',
        secondary:     '#2c1810',
        accent:        '#e8a830',
        background:    '#fdf6ee',
        surface:       '#fff8f0',
        surfaceAlt:    '#fef2e2',
        textPrimary:   '#1a0f08',
        textSecondary: '#5c3d2e',
        mutedText:     '#9a7060',
        border:        '#e8d5c0',
      },
      sectionFlow: { style: 'curved', dividerStyle: 'curve', backgroundStrategy: 'alternating_soft' },
    } as never,
    sectionBlueprints: [
      { slot: 'hero',         sectionType: 'hero',         required: true,  order: 0, design: sd({ backgroundType: 'image', textColor: '#ffffff', subtextColor: 'rgba(255,255,255,0.88)', spacing: 'luxury', dividerBottom: 'curve', overlay: { enabled: true, type: 'gradient', value: 'linear-gradient(to bottom, rgba(44,24,16,0.3) 0%, rgba(44,24,16,0.75) 100%)', opacity: 0.75 }, imageTreatment: 'overlay' }) as never, layoutVariant: 'fullscreen_center' },
      { slot: 'about',        sectionType: 'about',        required: false, order: 1, design: sd({ backgroundType: 'solid', backgroundValue: '#fdf6ee', textColor: '#1a0f08', subtextColor: '#5c3d2e', spacing: 'airy', dividerBottom: 'wave', cardStyle: 'floating' }) as never },
      { slot: 'feature_grid', sectionType: 'feature_grid', required: false, order: 2, design: sd({ backgroundType: 'solid', backgroundValue: '#fff8f0', textColor: '#1a0f08', subtextColor: '#5c3d2e', spacing: 'airy', cardStyle: 'floating', shadow: 'soft', borderRadius: 'large' }) as never, layoutVariant: 'menu_cards' },
      { slot: 'testimonials', sectionType: 'testimonials', required: false, order: 3, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #2c1810 0%, #4a2520 100%)', textColor: '#fdf6ee', subtextColor: 'rgba(253,246,238,0.8)', spacing: 'luxury', cardStyle: 'glass', dividerTop: 'curve', dividerBottom: 'curve' }) as never },
      { slot: 'cta',          sectionType: 'cta',          required: true,  order: 4, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #c9571a 0%, #e8a830 100%)', textColor: '#ffffff', subtextColor: 'rgba(255,255,255,0.9)', spacing: 'luxury', dividerTop: 'wave' }) as never },
      { slot: 'contact',      sectionType: 'contact',      required: false, order: 5, design: sd({ backgroundType: 'solid', backgroundValue: '#fdf6ee', textColor: '#1a0f08', spacing: 'airy' }) as never },
    ],
  },

  // ── 4. Modern Local Service ───────────────────────────────────────────────
  {
    key:           'modern_local_service',
    name:          'Modern Local Service',
    description:   'Trust-focused service business template with bold hero CTA, service cards, social proof, FAQ, and booking/contact integration.',
    category:      'local_service',
    layoutType:    'standard',
    animationLevel:'subtle',
    icon:          '🔧',
    previewGradient: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
    tags:          ['local', 'service', 'trust', 'clean'],
    features:      ['Trust-first hero', 'Service grid cards', 'Social proof section', 'FAQ accordion', 'Direct booking CTA', 'Clean professional design'],
    bestFor:       ['Plumbers', 'Electricians', 'HVAC', 'Contractors', 'Cleaning services'],
    designSystem: {
      designLevel: 'clean',
      palette: {
        primary:       '#1e5fa8',
        secondary:     '#0f172a',
        accent:        '#f59e0b',
        background:    '#f8fafc',
        surface:       '#ffffff',
        surfaceAlt:    '#f1f5f9',
        textPrimary:   '#0f172a',
        textSecondary: '#475569',
        mutedText:     '#94a3b8',
        border:        '#e2e8f0',
      },
      sectionFlow: { style: 'minimal', dividerStyle: 'none', backgroundStrategy: 'alternating_soft' },
    } as never,
    sectionBlueprints: [
      { slot: 'hero',         sectionType: 'hero',         required: true,  order: 0, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', textColor: '#f8fafc', subtextColor: 'rgba(248,250,252,0.82)', spacing: 'luxury', dividerBottom: 'angle' }) as never, layoutVariant: 'trust_hero' },
      { slot: 'feature_grid', sectionType: 'feature_grid', required: false, order: 1, design: sd({ backgroundType: 'solid', backgroundValue: '#f8fafc', textColor: '#0f172a', subtextColor: '#475569', spacing: 'airy', cardStyle: 'floating', shadow: 'soft' }) as never },
      { slot: 'about',        sectionType: 'about',        required: false, order: 2, design: sd({ backgroundType: 'solid', backgroundValue: '#ffffff', textColor: '#0f172a', spacing: 'airy' }) as never },
      { slot: 'testimonials', sectionType: 'testimonials', required: false, order: 3, design: sd({ backgroundType: 'solid', backgroundValue: '#f1f5f9', textColor: '#0f172a', subtextColor: '#475569', spacing: 'airy', cardStyle: 'floating', dividerTop: 'fade' }) as never },
      { slot: 'faq',          sectionType: 'faq',          required: false, order: 4, design: sd({ backgroundType: 'solid', backgroundValue: '#f8fafc', textColor: '#0f172a', spacing: 'airy' }) as never },
      { slot: 'cta',          sectionType: 'cta',          required: true,  order: 5, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #1e5fa8 0%, #1e3a5f 100%)', textColor: '#ffffff', subtextColor: 'rgba(255,255,255,0.88)', spacing: 'luxury' }) as never },
      { slot: 'contact',      sectionType: 'contact',      required: false, order: 6, design: sd({ backgroundType: 'solid', backgroundValue: '#ffffff', textColor: '#0f172a', spacing: 'airy' }) as never },
    ],
  },

  // ── 5. Luxury Editorial Brand ─────────────────────────────────────────────
  {
    key:           'luxury_editorial_brand',
    name:          'Luxury Editorial Brand',
    description:   'Ultra-high-end editorial aesthetic with oversized typography, full-bleed imagery, slow elegant transitions, and a signature quiet-luxury feel.',
    category:      'luxury',
    layoutType:    'editorial',
    animationLevel:'cinematic',
    icon:          '◆',
    previewGradient: 'linear-gradient(160deg, #f0ebe4 0%, #e8e0d8 50%, #d4ccc4 100%)',
    tags:          ['luxury', 'editorial', 'brand', 'premium'],
    features:      ['Full-bleed editorial sections', 'Oversized headline typography', 'Serif/editorial fonts', 'Quiet luxury palette', 'Refined micro-animations', 'Grid-based layout'],
    bestFor:       ['Boutiques', 'High-end retail', 'Luxury brands', 'Galleries'],
    designSystem: {
      designLevel: 'editorial',
      palette: {
        primary:       '#1a1512',
        secondary:     '#b5a090',
        accent:        '#8b6c5c',
        background:    '#f0ebe4',
        surface:       '#e8e0d8',
        surfaceAlt:    '#ddd5cc',
        textPrimary:   '#1a1512',
        textSecondary: '#4a3f38',
        mutedText:     '#8b7b72',
        border:        '#c8bdb5',
      },
      typography: { headingFontCategory: 'serif', bodyFontCategory: 'sans', headingFontStack: '"Playfair Display", "Georgia", serif', bodyFontStack: '"Inter", system-ui, sans-serif', headingWeight: 700, bodyWeight: 400, letterSpacing: '-0.01em', lineHeight: '1.7' },
      sectionFlow: { style: 'editorial', dividerStyle: 'fade', backgroundStrategy: 'alternating_soft' },
    } as never,
    sectionBlueprints: [
      { slot: 'hero',         sectionType: 'hero',         required: true,  order: 0, design: sd({ backgroundType: 'image', textColor: '#f0ebe4', subtextColor: 'rgba(240,235,228,0.85)', spacing: 'luxury', dividerBottom: 'fade', overlay: { enabled: true, type: 'gradient', value: 'linear-gradient(to bottom, rgba(26,21,18,0.2) 0%, rgba(26,21,18,0.7) 100%)', opacity: 0.7 } }) as never, layoutVariant: 'editorial_full' },
      { slot: 'about',        sectionType: 'about',        required: false, order: 1, design: sd({ backgroundType: 'solid', backgroundValue: '#f0ebe4', textColor: '#1a1512', subtextColor: '#4a3f38', spacing: 'luxury', cardStyle: 'editorial' }) as never, layoutVariant: 'editorial_split' },
      { slot: 'feature_grid', sectionType: 'feature_grid', required: false, order: 2, design: sd({ backgroundType: 'solid', backgroundValue: '#e8e0d8', textColor: '#1a1512', spacing: 'luxury', cardStyle: 'editorial', borderRadius: 'none' }) as never },
      { slot: 'testimonials', sectionType: 'testimonials', required: false, order: 3, design: sd({ backgroundType: 'solid', backgroundValue: '#1a1512', textColor: '#f0ebe4', subtextColor: '#b5a090', spacing: 'luxury', cardStyle: 'none' }) as never },
      { slot: 'cta',          sectionType: 'cta',          required: true,  order: 4, design: sd({ backgroundType: 'solid', backgroundValue: '#f0ebe4', textColor: '#1a1512', spacing: 'luxury' }) as never },
    ],
  },

  // ── 6. Promo Launch Page ──────────────────────────────────────────────────
  {
    key:           'promo_launch_page',
    name:          'Promo Launch Page',
    description:   'High-energy temporary promotion template for sales, events, holiday offers, and limited-time products. Applies a promo overlay to existing content without deleting it.',
    category:      'promo',
    layoutType:    'promo',
    animationLevel:'balanced',
    icon:          '🎯',
    previewGradient: 'linear-gradient(135deg, #7c3aed 0%, #db2777 50%, #f59e0b 100%)',
    tags:          ['promo', 'launch', 'sale', 'event'],
    features:      ['Promo hero with urgency', 'Featured offer highlight', 'Reward/coupon CTA', 'Product/service highlights', 'Bold gradient design', 'Fast-apply & fast-undo'],
    bestFor:       ['Sales events', 'Holiday campaigns', 'Product launches', 'Limited-time offers'],
    designSystem: {
      designLevel: 'bold',
      palette: {
        primary:       '#7c3aed',
        secondary:     '#db2777',
        accent:        '#f59e0b',
        background:    '#0f0714',
        surface:       '#1a0f1e',
        surfaceAlt:    '#220f28',
        textPrimary:   '#ffffff',
        textSecondary: '#e2c8ff',
        mutedText:     '#9c7abf',
        border:        '#3a1f4a',
      },
      sectionFlow: { style: 'layered', dividerStyle: 'wave', backgroundStrategy: 'continuous_gradient' },
    } as never,
    sectionBlueprints: [
      { slot: 'hero',         sectionType: 'hero',         required: true,  order: 0, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #7c3aed 0%, #db2777 60%, #f59e0b 100%)', textColor: '#ffffff', subtextColor: 'rgba(255,255,255,0.9)', spacing: 'luxury', dividerBottom: 'wave' }) as never, layoutVariant: 'promo_center' },
      { slot: 'feature_grid', sectionType: 'feature_grid', required: false, order: 1, design: sd({ backgroundType: 'solid', backgroundValue: '#0f0714', textColor: '#ffffff', subtextColor: '#e2c8ff', spacing: 'airy', cardStyle: 'glass', shadow: 'premium' }) as never, layoutVariant: 'offers_grid' },
      { slot: 'cta',          sectionType: 'cta',          required: true,  order: 2, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #f59e0b 0%, #db2777 100%)', textColor: '#ffffff', spacing: 'luxury', dividerTop: 'wave' }) as never, layoutVariant: 'promo_cta' },
      { slot: 'testimonials', sectionType: 'testimonials', required: false, order: 3, design: sd({ backgroundType: 'solid', backgroundValue: '#1a0f1e', textColor: '#ffffff', subtextColor: '#e2c8ff', cardStyle: 'glass', spacing: 'airy' }) as never },
    ],
  },

  // ── 7. Boutique Retail Showcase ───────────────────────────────────────────
  {
    key:           'boutique_retail_showcase',
    name:          'Boutique Retail Showcase',
    description:   'Curated boutique aesthetic with product-forward layout, editorial photography treatment, and sophisticated brand presence.',
    category:      'retail',
    layoutType:    'standard',
    animationLevel:'balanced',
    icon:          '🏪',
    previewGradient: 'linear-gradient(135deg, #f8f4ef 0%, #ede8e1 50%, #d4c9bc 100%)',
    tags:          ['retail', 'boutique', 'shop', 'products'],
    features:      ['Product showcase grid', 'Editorial photography treatment', 'Brand story section', 'Review cards', 'Shop CTA integration', 'Clean neutral palette'],
    bestFor:       ['Boutiques', 'Fashion', 'Artisan goods', 'Home decor'],
    designSystem: {
      designLevel: 'premium',
      palette: {
        primary:       '#6b5344',
        secondary:     '#2c1f16',
        accent:        '#c9a87c',
        background:    '#faf7f4',
        surface:       '#f2ede8',
        surfaceAlt:    '#e8e2db',
        textPrimary:   '#2c1f16',
        textSecondary: '#6b5344',
        mutedText:     '#a08070',
        border:        '#ddd5cc',
      },
      typography: { headingFontCategory: 'serif', bodyFontCategory: 'sans', headingFontStack: '"Cormorant Garamond", "Georgia", serif', bodyFontStack: '"Inter", system-ui, sans-serif', headingWeight: 600, bodyWeight: 400, letterSpacing: '0', lineHeight: '1.65' },
      sectionFlow: { style: 'soft_blend', dividerStyle: 'fade', backgroundStrategy: 'alternating_soft' },
    } as never,
    sectionBlueprints: [
      { slot: 'hero',         sectionType: 'hero',         required: true,  order: 0, design: sd({ backgroundType: 'image', textColor: '#2c1f16', subtextColor: '#6b5344', spacing: 'luxury', imageTreatment: 'editorial', dividerBottom: 'fade' }) as never, layoutVariant: 'boutique_split' },
      { slot: 'feature_grid', sectionType: 'feature_grid', required: false, order: 1, design: sd({ backgroundType: 'solid', backgroundValue: '#faf7f4', textColor: '#2c1f16', spacing: 'airy', cardStyle: 'floating', imageTreatment: 'editorial' }) as never, layoutVariant: 'product_editorial' },
      { slot: 'about',        sectionType: 'about',        required: false, order: 2, design: sd({ backgroundType: 'solid', backgroundValue: '#f2ede8', textColor: '#2c1f16', spacing: 'airy', cardStyle: 'editorial' }) as never },
      { slot: 'testimonials', sectionType: 'testimonials', required: false, order: 3, design: sd({ backgroundType: 'solid', backgroundValue: '#2c1f16', textColor: '#faf7f4', subtextColor: '#c9a87c', spacing: 'airy', cardStyle: 'none' }) as never },
      { slot: 'cta',          sectionType: 'cta',          required: true,  order: 4, design: sd({ backgroundType: 'solid', backgroundValue: '#faf7f4', textColor: '#2c1f16', spacing: 'luxury' }) as never },
    ],
  },

  // ── 8. Clean SaaS Landing ─────────────────────────────────────────────────
  {
    key:           'clean_saas_landing',
    name:          'Clean SaaS Landing',
    description:   'Crisp, conversion-focused SaaS landing page with feature grids, trust signals, testimonials, and a clear pricing/CTA path.',
    category:      'saas',
    layoutType:    'standard',
    animationLevel:'subtle',
    icon:          '⚡',
    previewGradient: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #2563eb 100%)',
    tags:          ['saas', 'tech', 'clean', 'conversion'],
    features:      ['Gradient hero with product preview', 'Feature comparison grid', 'Trust badges section', 'Customer testimonials', 'Pricing/CTA block', 'Clean blue palette'],
    bestFor:       ['SaaS products', 'Apps', 'Tech services', 'Digital tools'],
    designSystem: {
      designLevel: 'clean',
      palette: {
        primary:       '#2563eb',
        secondary:     '#1e3a5f',
        accent:        '#3b82f6',
        background:    '#ffffff',
        surface:       '#f8fafc',
        surfaceAlt:    '#f1f5f9',
        textPrimary:   '#0f172a',
        textSecondary: '#334155',
        mutedText:     '#94a3b8',
        border:        '#e2e8f0',
      },
      sectionFlow: { style: 'minimal', dividerStyle: 'none', backgroundStrategy: 'alternating_soft' },
    } as never,
    sectionBlueprints: [
      { slot: 'hero',         sectionType: 'hero',         required: true,  order: 0, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #2563eb 100%)', textColor: '#ffffff', subtextColor: 'rgba(255,255,255,0.82)', spacing: 'luxury', dividerBottom: 'angle' }) as never, layoutVariant: 'saas_hero' },
      { slot: 'feature_grid', sectionType: 'feature_grid', required: false, order: 1, design: sd({ backgroundType: 'solid', backgroundValue: '#ffffff', textColor: '#0f172a', spacing: 'airy', cardStyle: 'soft', shadow: 'soft' }) as never, layoutVariant: 'features_3col' },
      { slot: 'about',        sectionType: 'about',        required: false, order: 2, design: sd({ backgroundType: 'solid', backgroundValue: '#f8fafc', textColor: '#0f172a', spacing: 'airy' }) as never },
      { slot: 'testimonials', sectionType: 'testimonials', required: false, order: 3, design: sd({ backgroundType: 'solid', backgroundValue: '#ffffff', textColor: '#0f172a', subtextColor: '#334155', spacing: 'airy', cardStyle: 'bordered' }) as never },
      { slot: 'faq',          sectionType: 'faq',          required: false, order: 4, design: sd({ backgroundType: 'solid', backgroundValue: '#f8fafc', textColor: '#0f172a', spacing: 'airy' }) as never },
      { slot: 'cta',          sectionType: 'cta',          required: true,  order: 5, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #2563eb 0%, #1e3a5f 100%)', textColor: '#ffffff', spacing: 'luxury' }) as never },
    ],
  },

  // ── 9. Trustworthy Law Firm ───────────────────────────────────────────────
  {
    key:           'trustworthy_law_firm',
    name:          'Trustworthy Law Firm',
    description:   'Authoritative, dignified professional law firm website. Classic serif typography, deep navy palette, editorial layout, and no gimmicks.',
    category:      'law',
    layoutType:    'standard',
    animationLevel:'none',
    icon:          '⚖',
    previewGradient: 'linear-gradient(135deg, #0a1628 0%, #1a2d4a 60%, #243450 100%)',
    tags:          ['law', 'legal', 'professional', 'trust'],
    features:      ['Authoritative hero', 'Practice areas grid', 'Attorney profiles', 'Client testimonials', 'Clear contact CTA', 'No flashy animations'],
    bestFor:       ['Law firms', 'Attorneys', 'Legal services', 'Consultants'],
    designSystem: {
      designLevel: 'premium',
      palette: {
        primary:       '#1a2d4a',
        secondary:     '#0a1628',
        accent:        '#c9a84c',
        background:    '#f8f7f5',
        surface:       '#ffffff',
        surfaceAlt:    '#f0ede8',
        textPrimary:   '#0a1628',
        textSecondary: '#3d4f6a',
        mutedText:     '#7a8fa8',
        border:        '#d8d0c8',
      },
      typography: { headingFontCategory: 'serif', bodyFontCategory: 'sans', headingFontStack: '"Merriweather", "Georgia", serif', bodyFontStack: '"Inter", system-ui, sans-serif', headingWeight: 700, bodyWeight: 400, letterSpacing: '-0.01em', lineHeight: '1.65' },
      sectionFlow: { style: 'minimal', dividerStyle: 'none', backgroundStrategy: 'alternating_soft' },
    } as never,
    sectionBlueprints: [
      { slot: 'hero',         sectionType: 'hero',         required: true,  order: 0, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(180deg, #0a1628 0%, #1a2d4a 100%)', textColor: '#f8f7f5', subtextColor: 'rgba(248,247,245,0.8)', spacing: 'luxury', dividerBottom: 'angle' }) as never, layoutVariant: 'law_authority' },
      { slot: 'feature_grid', sectionType: 'feature_grid', required: false, order: 1, design: sd({ backgroundType: 'solid', backgroundValue: '#f8f7f5', textColor: '#0a1628', spacing: 'airy', cardStyle: 'bordered' }) as never, layoutVariant: 'practice_areas' },
      { slot: 'about',        sectionType: 'about',        required: false, order: 2, design: sd({ backgroundType: 'solid', backgroundValue: '#ffffff', textColor: '#0a1628', spacing: 'airy' }) as never },
      { slot: 'testimonials', sectionType: 'testimonials', required: false, order: 3, design: sd({ backgroundType: 'solid', backgroundValue: '#f0ede8', textColor: '#0a1628', spacing: 'airy', cardStyle: 'bordered' }) as never },
      { slot: 'faq',          sectionType: 'faq',          required: false, order: 4, design: sd({ backgroundType: 'solid', backgroundValue: '#f8f7f5', textColor: '#0a1628', spacing: 'airy' }) as never },
      { slot: 'cta',          sectionType: 'cta',          required: true,  order: 5, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #1a2d4a 0%, #0a1628 100%)', textColor: '#f8f7f5', subtextColor: 'rgba(248,247,245,0.8)', spacing: 'luxury' }) as never },
      { slot: 'contact',      sectionType: 'contact',      required: false, order: 6, design: sd({ backgroundType: 'solid', backgroundValue: '#ffffff', textColor: '#0a1628', spacing: 'airy' }) as never },
    ],
  },

  // ── 10. Automotive Showroom ───────────────────────────────────────────────
  {
    key:           'automotive_showroom',
    name:          'Automotive Showroom',
    description:   'Powerful, precision-engineered automotive website. Dark surfaces, metallic accents, angular dividers, and cinematic vehicle imagery treatment.',
    category:      'automotive',
    layoutType:    'standard',
    animationLevel:'cinematic',
    icon:          '🚗',
    previewGradient: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #2a2a2a 100%)',
    tags:          ['automotive', 'vehicles', 'dark', 'bold'],
    features:      ['Cinematic dark hero', 'Vehicle showcase grid', 'Specs feature grid', 'Angular section dividers', 'Service CTA', 'Metallic accent palette'],
    bestFor:       ['Auto dealerships', 'Repair shops', 'Car rentals', 'Detailing services'],
    designSystem: {
      designLevel: 'bold',
      palette: {
        primary:       '#c0c0c0',
        secondary:     '#0a0a0a',
        accent:        '#d4af37',
        background:    '#0a0a0a',
        surface:       '#141414',
        surfaceAlt:    '#1e1e1e',
        textPrimary:   '#e8e8e8',
        textSecondary: '#a0a0a0',
        mutedText:     '#606060',
        border:        '#2a2a2a',
      },
      sectionFlow: { style: 'angled', dividerStyle: 'angle', backgroundStrategy: 'layered_surfaces' },
    } as never,
    sectionBlueprints: [
      { slot: 'hero',         sectionType: 'hero',         required: true,  order: 0, design: sd({ backgroundType: 'image', textColor: '#e8e8e8', subtextColor: 'rgba(232,232,232,0.82)', spacing: 'luxury', dividerBottom: 'angle', overlay: { enabled: true, type: 'gradient', value: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.75) 100%)', opacity: 0.75 } }) as never, layoutVariant: 'automotive_hero' },
      { slot: 'feature_grid', sectionType: 'feature_grid', required: false, order: 1, design: sd({ backgroundType: 'solid', backgroundValue: '#141414', textColor: '#e8e8e8', subtextColor: '#a0a0a0', spacing: 'airy', cardStyle: 'bordered', shadow: 'medium' }) as never, layoutVariant: 'vehicle_showcase' },
      { slot: 'about',        sectionType: 'about',        required: false, order: 2, design: sd({ backgroundType: 'solid', backgroundValue: '#0a0a0a', textColor: '#e8e8e8', spacing: 'airy' }) as never },
      { slot: 'testimonials', sectionType: 'testimonials', required: false, order: 3, design: sd({ backgroundType: 'solid', backgroundValue: '#141414', textColor: '#e8e8e8', subtextColor: '#a0a0a0', spacing: 'airy', cardStyle: 'bordered', dividerTop: 'angle' }) as never },
      { slot: 'cta',          sectionType: 'cta',          required: true,  order: 4, design: sd({ backgroundType: 'gradient', backgroundValue: 'linear-gradient(135deg, #1e1e1e 0%, #d4af37 200%)', textColor: '#e8e8e8', spacing: 'luxury', dividerTop: 'angle' }) as never },
      { slot: 'contact',      sectionType: 'contact',      required: false, order: 5, design: sd({ backgroundType: 'solid', backgroundValue: '#0a0a0a', textColor: '#e8e8e8', spacing: 'airy' }) as never },
    ],
  },
]

// ── Registry helpers ──────────────────────────────────────────────────────────

export function getTemplate(key: string): WebsiteTemplate | null {
  return WEBSITE_TEMPLATES.find((t) => t.key === key) ?? null
}

export function getTemplatesByCategory(category: string): WebsiteTemplate[] {
  return WEBSITE_TEMPLATES.filter((t) => t.category === category)
}

export function getAllTemplates(): WebsiteTemplate[] {
  return WEBSITE_TEMPLATES
}
