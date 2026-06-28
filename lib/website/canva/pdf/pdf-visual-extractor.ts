// lib/website/canva/pdf/pdf-visual-extractor.ts
// SERVER-ONLY. Extracts text, links, and renders PDF pages to images for
// Canva PDF import visual fidelity. Uses pdfjs-dist + @napi-rs/canvas when
// available; falls back to text/link extraction only with a diagnostic warning.

import 'server-only'
import { uploadFile } from '@/lib/storage/uploadFile'
import { STORAGE_BUCKETS } from '@/lib/storage/buckets'

export interface CanvaPdfExtractedImage {
  storagePath: string
  publicUrl: string
  width?: number
  height?: number
  x?: number
  y?: number
  pageNumber: number
  kind: 'image' | 'graphic' | 'unknown'
}

export interface CanvaPdfLink {
  label?: string
  url?: string
  x?: number
  y?: number
  width?: number
  height?: number
  pageNumber: number
}

export interface CanvaPdfPageExtraction {
  pageNumber: number
  width: number
  height: number
  text: string
  renderedImageUrl?: string
  renderedStoragePath?: string
  thumbnailUrl?: string
  thumbnailStoragePath?: string
  extractedImages?: CanvaPdfExtractedImage[]
  links?: CanvaPdfLink[]
}

export interface CanvaPdfVisualExtraction {
  pageCount: number
  pages: CanvaPdfPageExtraction[]
  warnings: string[]
  renderedPageCount: number
  extractedGraphicsCount: number
  extractedLinksCount: number
}

interface ExtractParams {
  pdfBuffer: Buffer
  tenantId: string
  websiteId: string
  importId: string
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs'
  }
  return pdfjs
}

async function tryLoadCanvas() {
  try {
    const mod = await import('@napi-rs/canvas')
    return mod.createCanvas as (w: number, h: number) => {
      getContext: (t: string) => unknown
      toBuffer: (fmt: string) => Buffer
      width: number
      height: number
    }
  } catch {
    return null
  }
}

function normalizeLinkUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const u = raw.trim()
  if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(u)) return u
  if (/^www\./i.test(u)) return `https://${u}`
  return undefined
}

/** Renders PDF pages and extracts text + link annotations for hybrid conversion. */
export async function extractCanvaPdfVisuals(params: ExtractParams): Promise<CanvaPdfVisualExtraction> {
  const warnings: string[] = []
  const pages: CanvaPdfPageExtraction[] = []
  let renderedPageCount = 0
  const extractedGraphicsCount = 0
  let extractedLinksCount = 0

  const pdfjs = await loadPdfjs()
  const createCanvas = await tryLoadCanvas()
  if (!createCanvas) {
    warnings.push('Server-side PDF page rendering unavailable; design visuals will rely on AI sections. Individual graphics may be preserved as page visuals only.')
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(params.pdfBuffer),
    useSystemFonts: true,
    disableFontFace: true,
  })
  const pdf = await loadingTask.promise
  const pageCount = pdf.numPages

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item) => ('str' in item ? String(item.str) : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const links: CanvaPdfLink[] = []
    try {
      const annotations = await page.getAnnotations()
      for (const ann of annotations) {
        const url = normalizeLinkUrl(ann.url ?? ann.unsafeUrl)
        if (!url && !ann.title) continue
        const rect = Array.isArray(ann.rect) ? ann.rect : null
        links.push({
          label: typeof ann.title === 'string' ? ann.title : undefined,
          url,
          pageNumber,
          x: rect ? rect[0] : undefined,
          y: rect ? rect[1] : undefined,
          width: rect ? Math.abs(rect[2] - rect[0]) : undefined,
          height: rect ? Math.abs(rect[3] - rect[1]) : undefined,
        })
      }
    } catch {
      warnings.push(`Could not read link annotations on page ${pageNumber}.`)
    }
    extractedLinksCount += links.length

    let renderedImageUrl: string | undefined
    let renderedStoragePath: string | undefined
    let thumbnailUrl: string | undefined
    let thumbnailStoragePath: string | undefined

    if (createCanvas) {
      try {
        const scale = pageNumber === 1 ? 2 : 1.75
        const renderVp = page.getViewport({ scale })
        const canvas = createCanvas(Math.ceil(renderVp.width), Math.ceil(renderVp.height))
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
        await page.render({ canvasContext: ctx, viewport: renderVp }).promise
        const webp = canvas.toBuffer('image/webp')

        const pageUpload = await uploadFile({
          bucket: STORAGE_BUCKETS.WEBSITE_ASSETS,
          tenantId: params.tenantId,
          pathParts: ['website-builder', 'canva-pdf-imports', params.websiteId, params.importId, 'pages'],
          fileName: `page-${pageNumber}.webp`,
          buffer: webp,
          mimeType: 'image/webp',
          upsert: true,
        })
        renderedImageUrl = pageUpload.publicUrl
        renderedStoragePath = pageUpload.path
        renderedPageCount++

        const thumbScale = 0.35
        const thumbVp = page.getViewport({ scale: thumbScale })
        const thumbCanvas = createCanvas(Math.ceil(thumbVp.width), Math.ceil(thumbVp.height))
        const thumbCtx = thumbCanvas.getContext('2d') as CanvasRenderingContext2D
        await page.render({ canvasContext: thumbCtx, viewport: thumbVp }).promise
        const thumbWebp = thumbCanvas.toBuffer('image/webp')
        const thumbUpload = await uploadFile({
          bucket: STORAGE_BUCKETS.WEBSITE_ASSETS,
          tenantId: params.tenantId,
          pathParts: ['website-builder', 'canva-pdf-imports', params.websiteId, params.importId, 'thumbnails'],
          fileName: `page-${pageNumber}.webp`,
          buffer: thumbWebp,
          mimeType: 'image/webp',
          upsert: true,
        })
        thumbnailUrl = thumbUpload.publicUrl
        thumbnailStoragePath = thumbUpload.path
      } catch (e) {
        warnings.push(`Page ${pageNumber} render failed: ${e instanceof Error ? e.message : 'render error'}. Text and links were still extracted.`)
      }
    }

    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      text,
      renderedImageUrl,
      renderedStoragePath,
      thumbnailUrl,
      thumbnailStoragePath,
      links,
      extractedImages: [],
    })
  }

  if (renderedPageCount === 0 && pageCount > 0) {
    warnings.push('Some graphics may be preserved as page visuals if individual extraction is unavailable.')
  }

  return {
    pageCount,
    pages,
    warnings,
    renderedPageCount,
    extractedGraphicsCount,
    extractedLinksCount,
  }
}
