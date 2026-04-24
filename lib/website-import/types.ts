// lib/website-import/types.ts

// ── Job / Source status scalars ───────────────────────────────────────────────

export type ImportJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'

export type SourceFetchStatus = 'pending' | 'fetched' | 'failed'

export type SourceType = 'website' | 'yelp' | 'business_profile' | 'manual'

export type MediaAssetType =
  | 'logo'
  | 'favicon'
  | 'hero'
  | 'gallery'
  | 'product'
  | 'other'

// ── Database row shapes ───────────────────────────────────────────────────────

export interface ImportJob {
  id:            string
  tenant_id:     string
  created_by:    string
  status:        ImportJobStatus
  source_urls:   string[]
  notes:         string | null
  target_site_id: string | null
  target_page_id: string | null
  error_message: string | null
  progress:      number
  started_at:    string | null
  completed_at:  string | null
  created_at:    string
  updated_at:    string
}

export interface ImportSource {
  id:              string
  tenant_id:       string
  job_id:          string
  source_url:      string
  source_type:     SourceType
  page_title:      string | null
  fetched_status:  SourceFetchStatus
  confidence_score: number
  raw_metadata:    Record<string, unknown> | null
  raw_text:        string | null
  created_at:      string
  updated_at:      string
}

export interface ImportResult {
  id:              string
  tenant_id:       string
  job_id:          string
  result_key:      string
  source_key:      string | null
  mapped_section:  string | null
  result_value:    unknown
  confidence_score: number
  approved:        boolean
  created_at:      string
  updated_at:      string
}

export interface ImportMedia {
  id:         string
  tenant_id:  string
  job_id:     string
  source_url: string
  asset_url:  string
  asset_type: MediaAssetType | null
  alt_text:   string | null
  width:      number | null
  height:     number | null
  created_at: string
}

// ── Parsed content shapes ─────────────────────────────────────────────────────

export interface ParsedMetadata {
  title:          string | null
  description:    string | null
  keywords:       string[]
  canonical:      string | null
  ogTitle:        string | null
  ogDescription:  string | null
  ogImage:        string | null
  ogSiteName:     string | null
  twitterTitle:   string | null
  twitterDescription: string | null
  twitterImage:   string | null
  twitterSite:    string | null
  favicon:        string | null
  themeColor:     string | null
}

export interface ParsedStructuredData {
  type:           string
  name:           string | null
  description:    string | null
  url:            string | null
  logo:           string | null
  image:          string | null
  telephone:      string | null
  email:          string | null
  address:        StructuredAddress | null
  openingHours:   string[]
  priceRange:     string | null
  servesCuisine:  string | null
  menu:           string | null
  sameAs:         string[]
  aggregateRating: { ratingValue: number; reviewCount: number } | null
  review:         StructuredReview[]
  hasMap:         string | null
  geo:            { latitude: number; longitude: number } | null
  faqItems:       Array<{ question: string; answer: string }>
  services:       string[]
  raw:            unknown
}

export interface StructuredAddress {
  streetAddress:  string | null
  addressLocality: string | null
  addressRegion:  string | null
  postalCode:     string | null
  addressCountry: string | null
}

export interface StructuredReview {
  author:      string
  text:        string
  ratingValue: number
}

export interface ParsedVisibleContent {
  headings:      string[]
  paragraphs:    string[]
  lists:         string[][]
  links:         Array<{ href: string; text: string }>
  images:        Array<{ src: string; alt: string }>
  phoneNumbers:  string[]
  emails:        string[]
  addresses:     string[]
  hours:         string[]
  ctaTexts:      string[]
}

// ── Extracted business field shapes ──────────────────────────────────────────

export interface ScoredValue<T = string> {
  value:       T
  confidence:  number
  sourceUrl:   string
  sourceType:  SourceType
}

export interface ExtractedBusinessFields {
  businessName:   ScoredValue | null
  tagline:        ScoredValue | null
  description:    ScoredValue | null
  logoUrl:        ScoredValue | null
  faviconUrl:     ScoredValue | null
  phone:          ScoredValue | null
  email:          ScoredValue | null
  address:        ScoredValue<StructuredAddress | string> | null
  hours:          ScoredValue<string[]> | null
  socialLinks:    ScoredValue<Record<string, string>> | null
  services:       ScoredValue<string[]> | null
  products:       ScoredValue<string[]> | null
  testimonials:   ScoredValue<StructuredReview[]> | null
  faqItems:       ScoredValue<Array<{ question: string; answer: string }>> | null
  images:         ScoredValue<Array<{ src: string; alt: string }>> | null
  brandColors:    ScoredValue<{ primary: string; accent?: string }> | null
  seoTitle:       ScoredValue | null
  seoDescription: ScoredValue | null
  mapUrl:         ScoredValue | null
  latitude:       ScoredValue<number> | null
  longitude:      ScoredValue<number> | null
  priceRange:     ScoredValue | null
}

// ── Normalized content (safe, validated shape) ────────────────────────────────

export interface NormalizedImportContent {
  businessName:   string | null
  tagline:        string | null
  description:    string | null
  logoUrl:        string | null
  faviconUrl:     string | null
  phone:          string | null
  email:          string | null
  address: {
    street:   string | null
    city:     string | null
    state:    string | null
    zip:      string | null
    country:  string | null
    full:     string | null
  } | null
  hours:          string[]
  socialLinks: {
    facebook?:  string
    instagram?: string
    twitter?:   string
    linkedin?:  string
    yelp?:      string
    youtube?:   string
  }
  services:       Array<{ title: string; description: string }>
  testimonials:   Array<{ name: string; text: string; rating: number }>
  faqItems:       Array<{ question: string; answer: string }>
  images:         Array<{ url: string; alt: string }>
  brandColors:    { primary: string; accent: string } | null
  seoTitle:       string | null
  seoDescription: string | null
  mapUrl:         string | null
  latitude:       number | null
  longitude:      number | null
  priceRange:     string | null
  confidenceMap:  Record<string, number>
}

// ── Draft site mapping ────────────────────────────────────────────────────────

export interface DraftSiteConfig {
  settings: {
    site_name:    string | null
    logo_url:     string | null
    favicon_url:  string | null
    brand_colors: Record<string, string>
    seo_defaults: {
      title?:       string
      description?: string
    }
    footer_config: {
      showLogo:    boolean
      tagline?:    string
      copyright?:  string
      showSocials: boolean
      socials?:    Record<string, string>
    }
  }
  pages: DraftPage[]
}

export interface DraftPage {
  slug:             string
  title:            string
  page_type:        string
  meta_description: string | null
  sections:         DraftSection[]
}

export interface DraftSection {
  section_type: string
  section_key:  string
  content:      Record<string, unknown>
  sort_order:   number
}

// ── Job creation input ────────────────────────────────────────────────────────

export interface CreateImportJobInput {
  tenantId:   string
  createdBy:  string
  sourceUrls: string[]
  notes?:     string
}
