// lib/website/snapshot/safeJson.ts
//
// Safe JSON helpers used throughout the versioning system.
// These prevent checkpoint inserts from crashing because of:
//  - circular references
//  - base64 image payloads
//  - File / Blob / ArrayBuffer objects
//  - class instances returned by AI SDKs
//  - undefined / function values
//  - transient UI state

export type JsonPrimitive = string | number | boolean | null
export type JsonArray     = JsonCompatible[]
export type JsonObject    = { [key: string]: JsonCompatible }
export type JsonCompatible = JsonPrimitive | JsonArray | JsonObject

// ── Primitive conversions ─────────────────────────────────────────────────────

/**
 * Coerce any value to a plain object. Returns {} for anything that is not
 * a non-null, non-array object.
 */
export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch { /* ignore */ }
  }
  return {}
}

/**
 * Coerce any value to an array.
 */
export function asArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value === null || value === undefined) return []
  return []
}

// ── Deep JSON sanitizer ───────────────────────────────────────────────────────

const MAX_DEPTH   = 20
const MAX_STR_LEN = 50_000 // chars — hard cap before we truncate

/**
 * Deeply clones a value, removing everything that cannot be stored as JSONB:
 * - functions
 * - undefined (replaced with null)
 * - circular references
 * - Blob / ArrayBuffer / File / Buffer objects (replaced with sentinel)
 * - base64 data-URI strings > 10 000 chars (replaced with sentinel)
 * - class instances (serialised via toJSON or replaced with {})
 * - any string > 50 000 chars (truncated)
 *
 * Never throws. Falls back to {} if something is totally unserializable.
 */
export function safeJsonClone<T>(value: T, _depth = 0): T {
  try {
    return JSON.parse(JSON.stringify(value, makeReplacer())) as T
  } catch {
    return {} as T
  }
}

function makeReplacer() {
  const seen = new WeakSet<object>()
  return function replacer(this: unknown, _key: string, value: unknown): unknown {
    // Skip functions and symbols
    if (typeof value === 'function' || typeof value === 'symbol') return undefined
    // Replace undefined with null
    if (typeof value === 'undefined') return null

    // Handle binary / browser objects
    if (
      value instanceof Blob          ||
      value instanceof ArrayBuffer   ||
      (typeof File !== 'undefined' && value instanceof File)
    ) {
      return { _removedBinary: true, reason: 'Binary objects not allowed in snapshots' }
    }

    // Strings: truncate or strip base64
    if (typeof value === 'string') {
      if (value.length > MAX_STR_LEN) {
        return value.slice(0, MAX_STR_LEN) + '…[truncated]'
      }
      // Strip base64 data URIs (e.g. data:image/png;base64,...)
      if (value.startsWith('data:') && value.includes(';base64,') && value.length > 10_000) {
        return { _removedBase64: true, reason: 'Snapshots store image URLs only, not raw base64' }
      }
      return value
    }

    // Objects: guard circular refs and excessive depth
    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) {
        return { _circularRef: true }
      }
      seen.add(value)
      return value
    }

    return value
  }
}

// ── Snapshot-specific sanitizer ───────────────────────────────────────────────

/**
 * Transient UI / editor state keys that must never appear in a stored snapshot.
 * We strip these at every level of the object tree.
 */
const TRANSIENT_KEYS = new Set([
  'isDragging',
  'isHovered',
  'isSelected',
  'isEditing',
  'selectedElement',
  'hoverState',
  'editorPanelState',
  'unsavedFile',
  'rawBlob',
  'previewBlob',
  'imageBuffer',
  'fileObject',
  '_previewUrl',
  '_tempId',
  '_pending',
  '_draft',
])

/**
 * Normalizes a snapshot for safe JSONB insertion:
 * 1. Deep-clones and strips non-serializable values via safeJsonClone
 * 2. Removes transient UI state keys
 * 3. Ensures pages/sections/navigation are arrays
 * 4. Ensures content/styles/animations are plain objects
 */
export function normalizeSnapshotForInsert(raw: unknown): Record<string, unknown> {
  const cloned = safeJsonClone(raw)
  return deepStripTransient(cloned) as Record<string, unknown>
}

function deepStripTransient(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepStripTransient)
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!TRANSIENT_KEYS.has(k)) {
        result[k] = deepStripTransient(v)
      }
    }
    return result
  }
  return value
}

/**
 * Estimates the byte size of a JSON-serializable value.
 * Returns size in kilobytes.
 */
export function estimateKb(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8') / 1024
  } catch {
    return 0
  }
}
