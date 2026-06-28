// lib/website/canva/pdf/pdf-visual-extractor.ts
// SERVER-ONLY. Extracts text + PDF link annotations (rendering is in render-canva-pdf-pages.ts).

import 'server-only'
import type { RenderedCanvaPdfPage } from '@/lib/website/canva/pdf/render-canva-pdf-pages'
import type { PdfLinkAnnotation } from '@/lib/website/canva/pdf/canva-pdf-link-mapper'

export interface CanvaPdfPageExtraction {
  pageNumber: number
  width: number
  height: number
  text: string
  links: PdfLinkAnnotation[]
  rendered?: RenderedCanvaPdfPage
}

export interface CanvaPdfVisualExtraction {
  pageCount: number
  pages: CanvaPdfPageExtraction[]
  warnings: string[]
  extractedLinksCount: number
}

interface ExtractParams {
  pdfBuffer: Buffer
  renderedPages: RenderedCanvaPdfPage[]
}

function normalizeLinkUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const u = raw.trim()
  if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(u)) return u
  if (/^www\./i.test(u)) return `https://${u}`
  return undefined
}

/** Extracts text and link annotations per page (no rendering). */
export async function extractCanvaPdfTextAndLinks(params: ExtractParams): Promise<CanvaPdfVisualExtraction> {
  const warnings: string[] = []
  const pages: CanvaPdfPageExtraction[] = []
  let extractedLinksCount = 0

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs'
  }

  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(params.pdfBuffer),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise

  const renderedByPage = new Map(params.renderedPages.map((p) => [p.pageNumber, p]))

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item) => ('str' in item ? String(item.str) : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const links: PdfLinkAnnotation[] = []
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
          pageWidth: viewport.width,
          pageHeight: viewport.height,
        })
      }
    } catch {
      warnings.push(`Could not read link annotations on page ${pageNumber}.`)
    }
    extractedLinksCount += links.length

    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      text,
      links,
      rendered: renderedByPage.get(pageNumber),
    })
  }

  return { pageCount: pdf.numPages, pages, warnings, extractedLinksCount }
}
