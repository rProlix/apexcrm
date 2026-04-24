// lib/website/types.ts

// ── Scalar enums ─────────────────────────────────────────────────────────────

export type PageType =
  | 'home'
  | 'shop'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'account'
  | 'orders'
  | 'contact'
  | 'faq'
  | 'about'
  | 'custom'

export type PageStatus = 'draft' | 'published' | 'archived'

export type SectionType =
  | 'hero'
  | 'feature_grid'
  | 'image_gallery'
  | 'product_grid'
  | 'testimonials'
  | 'faq'
  | 'cta'
  | 'contact'
  | 'rich_text'
  | 'banner'
  | 'about'
  | 'custom'

export type NavLocation = 'header' | 'footer'

export type VersionStatus = 'draft' | 'published' | 'archived'

// ── Theme ────────────────────────────────────────────────────────────────────

export interface WebsiteTheme {
  primaryColor:    string
  accentColor:     string
  backgroundColor: string
  surfaceColor:    string
  textColor:       string
  mutedColor:      string
  borderColor:     string
  fontHeading:     string
  fontBody:        string
  borderRadius:    'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  mode:            'dark' | 'light'
}

export interface WebsiteFont {
  heading: string
  body:    string
}

export interface WebsiteBrandColors {
  primary:    string
  accent:     string
  background: string
  surface:    string
  text:       string
  muted:      string
  border:     string
}

// ── Section content contracts ─────────────────────────────────────────────────

export interface HeroContent {
  headline:             string
  subheadline:          string
  ctaLabel:             string
  ctaHref:              string
  ctaSecondaryLabel?:   string
  ctaSecondaryHref?:    string
  backgroundImage?:     string
  backgroundVideo?:     string
  overlay:              boolean
  overlayOpacity:       number
  align:                'left' | 'center' | 'right'
}

export interface FeatureGridContent {
  headline: string
  subtitle: string
  columns:  2 | 3 | 4
  items:    Array<{
    icon?:       string
    image?:      string
    title:       string
    description: string
  }>
}

export interface ProductGridContent {
  headline:     string
  subtitle:     string
  limit:        number
  showAll:      boolean
  allHref:      string
  filterActive: boolean
}

export interface TestimonialsContent {
  headline: string
  items:    Array<{
    name:    string
    role?:   string
    avatar?: string
    text:    string
    rating:  number
  }>
}

export interface FaqContent {
  headline: string
  items:    Array<{
    question: string
    answer:   string
  }>
}

export interface CtaContent {
  headline:  string
  body:      string
  ctaLabel:  string
  ctaHref:   string
  align:     'left' | 'center' | 'right'
}

export interface ContactContent {
  headline:  string
  body:      string
  email?:    string
  phone?:    string
  address?:  string
  showForm:  boolean
}

export interface RichTextContent {
  html: string
}

export interface BannerContent {
  text:        string
  ctaLabel?:   string
  ctaHref?:    string
  variant:     'info' | 'promo' | 'warning'
  dismissible: boolean
}

export interface ImageGalleryContent {
  headline?: string
  images:    Array<{ url: string; alt: string; caption?: string }>
  layout:    'grid' | 'masonry' | 'carousel'
}

export interface AboutContent {
  headline:   string
  body:       string
  image?:     string
  teamItems?: Array<{ name: string; role: string; avatar?: string }>
}

export type SectionContent =
  | HeroContent
  | FeatureGridContent
  | ProductGridContent
  | TestimonialsContent
  | FaqContent
  | CtaContent
  | ContactContent
  | RichTextContent
  | BannerContent
  | ImageGalleryContent
  | AboutContent
  | Record<string, unknown>

// ── Site config sub-objects ───────────────────────────────────────────────────

export interface SeoDefaults {
  title?:          string
  description?:    string
  ogImage?:        string
  twitterHandle?:  string
  keywords?:       string[]
}

export interface HeaderConfig {
  showLogo:    boolean
  showNav:     boolean
  transparent: boolean
  sticky:      boolean
  ctaLabel?:   string
  ctaHref?:    string
}

export interface FooterConfig {
  showLogo:    boolean
  tagline?:    string
  copyright?:  string
  showSocials: boolean
  socials?: {
    twitter?:   string
    instagram?: string
    facebook?:  string
    linkedin?:  string
  }
}

// ── Database row types ────────────────────────────────────────────────────────

export type DomainType = 'subdomain' | 'custom'

export interface SiteSettings {
  id:            string
  tenant_id:     string
  site_name:     string | null
  logo_url:      string | null
  favicon_url:   string | null
  brand_colors:  WebsiteBrandColors
  fonts:         WebsiteFont
  theme:         Partial<WebsiteTheme>
  seo_defaults:  SeoDefaults
  header_config: HeaderConfig
  footer_config: FooterConfig
  custom_domain: string | null
  subdomain:     string | null
  /** Controls which domain is active for the public site. */
  domain_type:   DomainType
  is_published:  boolean
  created_at:    string
  updated_at:    string
}

export interface SitePage {
  id:               string
  tenant_id:        string
  slug:             string
  title:            string | null
  meta_description: string | null
  page_type:        PageType
  status:           PageStatus
  sort_order:       number
  created_at:       string
  updated_at:       string
}

export interface SiteSection {
  id:           string
  tenant_id:    string
  page_id:      string
  section_type: SectionType
  section_key:  string | null
  content:      SectionContent
  sort_order:   number
  is_visible:   boolean
  created_at:   string
  updated_at:   string
}

export interface SiteNavigationItem {
  id:         string
  tenant_id:  string
  label:      string
  href:       string
  sort_order: number
  is_visible: boolean
  location:   NavLocation
  created_at: string
  updated_at: string
}

export interface SiteAsset {
  id:         string
  tenant_id:  string
  asset_type: string
  url:        string
  metadata:   Record<string, unknown>
  created_at: string
}

export interface SiteVersion {
  id:           string
  tenant_id:    string
  version_name: string | null
  snapshot:     SiteSnapshot
  status:       VersionStatus
  created_at:   string
  updated_at:   string
}

export interface SiteAnalytics {
  id:         string
  tenant_id:  string
  page_slug:  string | null
  event_type: string
  metadata:   Record<string, unknown>
  created_at: string
}

// ── Composite / derived types ─────────────────────────────────────────────────

export interface SiteSnapshot {
  settings:   Omit<SiteSettings, 'id' | 'created_at' | 'updated_at'>
  pages:      Array<SitePage & { sections: SiteSection[] }>
  navigation: SiteNavigationItem[]
}

export interface PublishedSiteConfig {
  tenant_id:  string
  settings:   SiteSettings
  pages:      Array<SitePage & { sections: SiteSection[] }>
  navigation: {
    header: SiteNavigationItem[]
    footer: SiteNavigationItem[]
  }
  theme:      WebsiteTheme
}

export interface SiteByHostResult {
  tenant: {
    id:            string
    name:          string
    slug:          string
    subdomain:     string | null
    custom_domain: string | null
  }
  settings:    SiteSettings | null
  isPublished: boolean
}

// ── Section type metadata (used by the builder UI) ───────────────────────────

export interface SectionTypeMeta {
  type:           SectionType
  label:          string
  description:    string
  icon:           string
  defaultContent: SectionContent
}

export const SECTION_TYPE_META: Record<SectionType, SectionTypeMeta> = {
  hero: {
    type: 'hero',
    label: 'Hero Banner',
    description: 'Full-width hero with headline, subtitle, and call-to-action',
    icon: 'layout',
    defaultContent: {
      headline:       'Welcome to Our Store',
      subheadline:    'Discover premium products curated for you.',
      ctaLabel:       'Shop Now',
      ctaHref:        '/shop',
      overlay:        true,
      overlayOpacity: 50,
      align:          'center',
    } as HeroContent,
  },
  feature_grid: {
    type: 'feature_grid',
    label: 'Feature Grid',
    description: 'Highlight key features or services in a grid layout',
    icon: 'grid',
    defaultContent: {
      headline: 'Why Choose Us',
      subtitle: '',
      columns:  3,
      items: [
        { title: 'Quality',  description: 'Premium materials and craftsmanship.' },
        { title: 'Speed',    description: 'Fast shipping on every order.' },
        { title: 'Support',  description: '24/7 customer service.' },
      ],
    } as FeatureGridContent,
  },
  product_grid: {
    type: 'product_grid',
    label: 'Product Grid',
    description: 'Display live products from your store',
    icon: 'shopping-bag',
    defaultContent: {
      headline:     'Featured Products',
      subtitle:     '',
      limit:        8,
      showAll:      true,
      allHref:      '/shop',
      filterActive: true,
    } as ProductGridContent,
  },
  testimonials: {
    type: 'testimonials',
    label: 'Testimonials',
    description: 'Customer reviews and social proof',
    icon: 'star',
    defaultContent: {
      headline: 'What Our Customers Say',
      items:    [],
    } as TestimonialsContent,
  },
  faq: {
    type: 'faq',
    label: 'FAQ',
    description: 'Frequently asked questions accordion',
    icon: 'help-circle',
    defaultContent: {
      headline: 'Frequently Asked Questions',
      items:    [],
    } as FaqContent,
  },
  cta: {
    type: 'cta',
    label: 'Call to Action',
    description: 'Conversion-focused section with headline and button',
    icon: 'zap',
    defaultContent: {
      headline: 'Ready to Get Started?',
      body:     '',
      ctaLabel: 'Get Started',
      ctaHref:  '/shop',
      align:    'center',
    } as CtaContent,
  },
  contact: {
    type: 'contact',
    label: 'Contact Section',
    description: 'Contact information and optional inquiry form',
    icon: 'mail',
    defaultContent: {
      headline: 'Get In Touch',
      body:     '',
      showForm: true,
    } as ContactContent,
  },
  rich_text: {
    type: 'rich_text',
    label: 'Rich Text',
    description: 'Free-form HTML content block',
    icon: 'type',
    defaultContent: { html: '<p>Add your content here.</p>' } as RichTextContent,
  },
  banner: {
    type: 'banner',
    label: 'Announcement Banner',
    description: 'Top-of-page promotional or informational banner',
    icon: 'megaphone',
    defaultContent: {
      text:        'Free shipping on orders over $50!',
      variant:     'promo',
      dismissible: true,
    } as BannerContent,
  },
  image_gallery: {
    type: 'image_gallery',
    label: 'Image Gallery',
    description: 'Photo gallery with multiple layout options',
    icon: 'image',
    defaultContent: {
      images: [],
      layout: 'grid',
    } as ImageGalleryContent,
  },
  about: {
    type: 'about',
    label: 'About Section',
    description: 'Company story, mission, or team introduction',
    icon: 'users',
    defaultContent: {
      headline: 'About Us',
      body:     'Tell your story here.',
    } as AboutContent,
  },
  custom: {
    type: 'custom',
    label: 'Custom Block',
    description: 'Advanced custom content block',
    icon: 'code',
    defaultContent: {},
  },
}

// ── Page type metadata ────────────────────────────────────────────────────────

export interface PageTypeMeta {
  type:        PageType
  label:       string
  slug:        string
  isSystem:    boolean
  description: string
}

export const PAGE_TYPE_META: Record<PageType, PageTypeMeta> = {
  home:     { type: 'home',     label: 'Home',          slug: '',          isSystem: true,  description: 'Main landing page' },
  shop:     { type: 'shop',     label: 'Shop',          slug: 'shop',      isSystem: true,  description: 'Product catalog' },
  product:  { type: 'product',  label: 'Product Detail',slug: 'shop/[id]', isSystem: true,  description: 'Individual product page' },
  cart:     { type: 'cart',     label: 'Cart',          slug: 'cart',      isSystem: true,  description: 'Shopping cart' },
  checkout: { type: 'checkout', label: 'Checkout',      slug: 'checkout',  isSystem: true,  description: 'Checkout flow' },
  account:  { type: 'account',  label: 'My Account',    slug: 'account',   isSystem: true,  description: 'Customer account page' },
  orders:   { type: 'orders',   label: 'Order History', slug: 'orders',    isSystem: true,  description: 'Customer order history' },
  contact:  { type: 'contact',  label: 'Contact',       slug: 'contact',   isSystem: false, description: 'Contact page' },
  faq:      { type: 'faq',      label: 'FAQ',           slug: 'faq',       isSystem: false, description: 'Frequently asked questions' },
  about:    { type: 'about',    label: 'About',         slug: 'about',     isSystem: false, description: 'About the business' },
  custom:   { type: 'custom',   label: 'Custom Page',   slug: '',          isSystem: false, description: 'Freeform custom page' },
}
