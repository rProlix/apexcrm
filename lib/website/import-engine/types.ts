// lib/website/import-engine/types.ts
// Universal AI Design Import Engine — shared types for all import sources.

export type DesignImportSourceType =
  | 'canva_url'
  | 'canva_site'
  | 'canva_custom_domain'
  | 'canva_pdf'
  | 'canva_zip'
  | 'figma_export'
  | 'pdf'
  | 'pdf_brochure'
  | 'pdf_invitation'
  | 'flyer'
  | 'presentation'
  | 'powerpoint'
  | 'google_slides'
  | 'image'
  | 'images'
  | 'unknown'

export type DesignImportStage =
  | 'detect'
  | 'extract'
  | 'render'
  | 'analyze'
  | 'reconstruct'
  | 'validate'
  | 'save'
  | 'complete'
  | 'failed'

export type DesignImportTarget = 'config_event' | 'builder'

export interface DesignImportConfidence {
  visualMatch: number
  layoutMatch: number
  typographyMatch: number
  colorMatch: number
  imagesMatch: number
  buttonsMatch: number
  animationsMatch: number
  responsiveMatch: number
  overall: number
}

export interface DesignImportDiagnostics {
  importType: DesignImportSourceType
  pages: number
  imagesFound: number
  graphicsFound: number
  illustrationsFound: number
  fontsDetected: number
  buttonsFound: number
  linksFound: number
  backgroundsFound: number
  animationsCreated: number
  sectionsCreated: number
  responsiveLayout: boolean
  confidence: DesignImportConfidence
  warnings: string[]
  errors: string[]
  timeTakenMs: number
  geminiTokenUsage?: Record<string, unknown>
  attemptCount: number
  stagesCompleted: DesignImportStage[]
}

export interface ExtractedAsset {
  id: string
  kind: 'image' | 'illustration' | 'logo' | 'icon' | 'background' | 'pattern' | 'unknown'
  publicUrl: string
  storagePath: string
  pageNumber?: number
  width?: number
  height?: number
}

export interface ExtractedLink {
  label: string
  href: string
  pageNumber?: number
  xPercent?: number
  yPercent?: number
}

export interface DesignImportExtraction {
  sourceType: DesignImportSourceType
  pageCount: number
  renderedPages: Array<{
    pageNumber: number
    publicUrl: string
    storagePath: string
    thumbnailUrl?: string
    aspectRatio: number
    width: number
    height: number
  }>
  text: string
  links: ExtractedLink[]
  assets: ExtractedAsset[]
  fonts: string[]
  colors: string[]
  warnings: string[]
}

export interface ReconstructedSection {
  section_type: string
  section_key: string
  content: Record<string, unknown>
  animation?: Record<string, unknown>
  responsive?: { desktop?: Record<string, unknown>; tablet?: Record<string, unknown>; mobile?: Record<string, unknown> }
}

export interface DesignImportReconstruction {
  theme: Record<string, unknown>
  pages: Array<{ title: string; slug: string; sections: ReconstructedSection[] }>
  linkMapping: Array<{ id: string; label: string; href: string; actionType?: string; dead?: boolean }>
  animations: Record<string, unknown>
  eventMetadata?: Record<string, unknown>
  rsvp?: { enabled: boolean; pageCreated: boolean; pageTitle?: string; route?: string }
  detectedComponentCount: number
  warnings: string[]
}

export interface RunDesignImportParams {
  tenantId: string
  websiteId: string
  importId: string
  createdBy?: string | null
  /** PDF buffer, image buffers, or URL string depending on source */
  input: {
    pdfBuffer?: Buffer
    imageBuffers?: Array<{ buffer: Buffer; mimeType: string; fileName: string }>
    url?: string
    fileName?: string
  }
  options?: {
    povEnabled?: boolean
    eventSlug?: string
    animationLevel?: string
    userPrompt?: string
    maxAttempts?: number
  }
}

export interface RunDesignImportResult {
  ok: boolean
  error?: string
  draftPreviewUrl?: string
  liveUrl?: string
  reconstruction?: DesignImportReconstruction
  extraction?: DesignImportExtraction
  diagnostics?: DesignImportDiagnostics
  publishAvailable?: boolean
}
