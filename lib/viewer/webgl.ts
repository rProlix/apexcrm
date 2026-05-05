// lib/viewer/webgl.ts
// Safe WebGL capability detection.
//
// Always call this BEFORE instantiating THREE.WebGLRenderer.
// On iOS Safari, mobile webviews, and some Android devices,
// `getShaderPrecisionFormat` can throw or return null even when a WebGL
// context was returned — which causes the error:
//   "null is not an object (evaluating 'e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision')"
//
// CLIENT-ONLY — do not call from server-side code.

export type WebGLSupportResult = {
  supported: boolean
  reason?: string
}

/**
 * Detects whether a working WebGL context is available on this device.
 *
 * Checks:
 *  1. We are in a browser environment.
 *  2. `canvas.getContext('webgl2' | 'webgl' | 'experimental-webgl')` returns a context.
 *  3. `getShaderPrecisionFormat` exists and does not throw or return null.
 *
 * @returns `{ supported: true }` when safe to instantiate Three.js WebGLRenderer.
 *          `{ supported: false, reason: string }` otherwise.
 *
 * @example
 *   const { supported, reason } = getWebGLSupport()
 *   if (!supported) {
 *     console.warn(`[360-viewer] WebGL unavailable (${reason}), using sequence fallback`)
 *     return <SequencePreview ... />
 *   }
 */
export function getWebGLSupport(): WebGLSupportResult {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'server' }
  }

  try {
    const canvas = document.createElement('canvas')

    // Prefer WebGL2, fall back to WebGL1
    const gl = (
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    ) as WebGLRenderingContext | null

    if (!gl) {
      return { supported: false, reason: 'no-webgl-context' }
    }

    // Critical check: getShaderPrecisionFormat can be missing or throw on
    // iOS < 15, old Android WebViews, and some desktop GPU blocklists.
    if (typeof gl.getShaderPrecisionFormat !== 'function') {
      return { supported: false, reason: 'shader-precision-fn-missing' }
    }

    const precision = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT)
    if (!precision) {
      return { supported: false, reason: 'shader-precision-unavailable' }
    }

    // Minimal sanity: context must not already be in a lost state
    if (typeof (gl as WebGLRenderingContext & { isContextLost?: () => boolean }).isContextLost === 'function') {
      if ((gl as WebGLRenderingContext & { isContextLost: () => boolean }).isContextLost()) {
        return { supported: false, reason: 'context-lost' }
      }
    }

    return { supported: true }
  } catch (err) {
    return {
      supported: false,
      reason:    err instanceof Error ? err.message : 'unknown-webgl-error',
    }
  }
}
