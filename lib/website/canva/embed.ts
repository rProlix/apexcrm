// lib/website/canva/embed.ts
// Backwards-compatible re-export shim. The real Canva embed/URL logic now lives
// in canva-url.ts (validation) and canva-embed.ts (embed extraction + iframe
// building) so there is a single shared validator. Existing imports of
// '@/lib/website/canva/embed' continue to work.

export {
  extractCanvaEmbedSrc,
  isValidCanvaInput,
  buildSafeCanvaIframe,
  resolveCanvaEmbedSrc,
  validateCanvaEmbedInput,
} from './canva-embed'

export {
  normalizeCanvaUrl,
  validateCanvaPreserveUrl,
  isNativeCanvaHost,
  isCanvaSiteHost,
  isUnsafeOrInternalHost,
  type CanvaUrlValidationResult,
  type CanvaValidationMode,
} from './canva-url'
