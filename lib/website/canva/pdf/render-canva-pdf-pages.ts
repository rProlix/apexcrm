// lib/website/canva/pdf/render-canva-pdf-pages.ts
// SERVER-ONLY. Renders every Canva PDF page to high-quality web images.
// Required for visual-first PDF import — conversion fails if this produces zero pages.

import 'server-only'
import { uploadFile } from '@/lib/storage/uploadFile'
import { STORAGE_BUCKETS } from '@/lib/storage/buckets'

export interface RenderedCanvaPdfPage {
  pageNumber: number
  width: number
  height: number
  aspectRatio: number
  storagePath: string
  publicUrl: string
  thumbnailUrl?: string
  thumbnailStoragePath?: string
}

export interface RenderCanvaPdfPagesResult {
  ok: boolean
  error?: string
  pages: RenderedCanvaPdfPage[]
  pageCount: number
  renderedPageCount: number
  warnings: string[]
}

export const PDF_RENDER_FAILED_MESSAGE =
  'PDF page rendering failed, so the Canva design visuals could not be imported.'

export const PDF_RENDER_ZERO_MESSAGE =
  'Could not render Canva PDF pages, so the visual design could not be imported.'

interface RenderParams {
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

async function loadCanvas() {
  const mod = await import('@napi-rs/canvas')
  return mod.createCanvas
}

function canvasToImageBuffer(canvas: { toBuffer: (fmt: string) => Buffer }): { buffer: Buffer; mimeType: 'image/webp' | 'image/png' } {
  try {
    return { buffer: canvas.toBuffer('image/webp'), mimeType: 'image/webp' }
  } catch {
    return { buffer: canvas.toBuffer('image/png'), mimeType: 'image/png' }
  }
}

/** Renders all PDF pages to stored web images. Throws nothing — returns ok:false on total failure. */
export async function renderCanvaPdfPages(params: RenderParams): Promise<RenderCanvaPdfPagesResult> {
  const warnings: string[] = []
  const pages: RenderedCanvaPdfPage[] = []

  let createCanvas: Awaited<ReturnType<typeof loadCanvas>>
  try {
    createCanvas = await loadCanvas()
  } catch (e) {
    return {
      ok: false,
      error: PDF_RENDER_FAILED_MESSAGE,
      pages: [],
      pageCount: 0,
      renderedPageCount: 0,
      warnings: [`Canvas unavailable: ${e instanceof Error ? e.message : 'unknown'}`],
    }
  }

  let pdf: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>
  try {
    const pdfjs = await loadPdfjs()
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(params.pdfBuffer),
      useSystemFonts: true,
      disableFontFace: true,
      standardFontDataUrl: undefined,
    }).promise
  } catch (e) {
    return {
      ok: false,
      error: PDF_RENDER_FAILED_MESSAGE,
      pages: [],
      pageCount: 0,
      renderedPageCount: 0,
      warnings: [`PDF load failed: ${e instanceof Error ? e.message : 'unknown'}`],
    }
  }

  const pageCount = pdf.numPages
  let renderFailures = 0

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    try {
      const page = await pdf.getPage(pageNumber)
      const baseVp = page.getViewport({ scale: 1 })
      const scale = pageNumber === 1 ? 2.5 : 2
      const renderVp = page.getViewport({ scale })
      const canvas = createCanvas(Math.ceil(renderVp.width), Math.ceil(renderVp.height))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: renderVp }).promise

      const { buffer, mimeType } = canvasToImageBuffer(canvas as { toBuffer: (fmt: string) => Buffer })
      const ext = mimeType === 'image/webp' ? 'webp' : 'png'

      const pageUpload = await uploadFile({
        bucket: STORAGE_BUCKETS.WEBSITE_ASSETS,
        tenantId: params.tenantId,
        pathParts: ['website-builder', 'canva-pdf-imports', params.websiteId, params.importId, 'rendered-pages'],
        fileName: `page-${pageNumber}.${ext}`,
        buffer,
        mimeType,
        upsert: true,
      })

      let thumbnailUrl: string | undefined
      let thumbnailStoragePath: string | undefined
      try {
        const thumbVp = page.getViewport({ scale: 0.35 })
        const thumbCanvas = createCanvas(Math.ceil(thumbVp.width), Math.ceil(thumbVp.height))
        const thumbCtx = thumbCanvas.getContext('2d')
        thumbCtx.fillStyle = '#ffffff'
        thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height)
        await page.render({ canvasContext: thumbCtx as unknown as CanvasRenderingContext2D, viewport: thumbVp }).promise
        const thumbImg = canvasToImageBuffer(thumbCanvas as { toBuffer: (fmt: string) => Buffer })
        const thumbUpload = await uploadFile({
          bucket: STORAGE_BUCKETS.WEBSITE_ASSETS,
          tenantId: params.tenantId,
          pathParts: ['website-builder', 'canva-pdf-imports', params.websiteId, params.importId, 'thumbnails'],
          fileName: `page-${pageNumber}.${ext}`,
          buffer: thumbImg.buffer,
          mimeType: thumbImg.mimeType,
          upsert: true,
        })
        thumbnailUrl = thumbUpload.publicUrl
        thumbnailStoragePath = thumbUpload.path
      } catch {
        warnings.push(`Thumbnail for page ${pageNumber} could not be generated.`)
      }

      const aspectRatio = baseVp.height / baseVp.width
      pages.push({
        pageNumber,
        width: baseVp.width,
        height: baseVp.height,
        aspectRatio,
        storagePath: pageUpload.path,
        publicUrl: pageUpload.publicUrl ?? '',
        thumbnailUrl,
        thumbnailStoragePath,
      })
    } catch (e) {
      renderFailures++
      warnings.push(`Page ${pageNumber} render failed: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  const renderedPageCount = pages.length
  if (renderedPageCount === 0) {
    return {
      ok: false,
      error: PDF_RENDER_ZERO_MESSAGE,
      pages: [],
      pageCount,
      renderedPageCount: 0,
      warnings,
    }
  }

  if (renderFailures > 0) {
    warnings.push(`${renderFailures} page(s) could not be rendered; imported site uses ${renderedPageCount} visual page(s).`)
  }

  return { ok: true, pages, pageCount, renderedPageCount, warnings }
}
