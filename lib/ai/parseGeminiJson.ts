// lib/ai/parseGeminiJson.ts
// Utilities for safely parsing JSON from Gemini text responses.
//
// Gemini text models always return plain text. When asked to produce JSON they
// will sometimes wrap it in markdown code fences:
//   ```json\n{...}\n```
// or include explanatory prose before/after the object.
//
// These helpers strip that noise and parse the JSON safely, giving callers a
// typed result with a clear error when parsing fails.
//
// SERVER-SAFE — has no Node.js / server-only imports, but also fine on the server.

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Removes markdown code fences from a string.
 * Handles:
 *   ```json\n...\n```
 *   ```\n...\n```
 *   ``` ... ```  (inline, single-line)
 */
export function stripCodeFences(input: string): string {
  return input
    .trim()
    .replace(/^```(?:json|JSON)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()
}

/**
 * Finds the first top-level JSON object `{...}` or array `[...]` in a string.
 * Strips surrounding prose that Gemini sometimes adds before or after the JSON.
 *
 * Returns the extracted substring as-is (not parsed).
 * Returns the original string unchanged if no `{` / `[` boundary is found.
 */
export function extractJsonObject(input: string): string {
  const text = input.trim()

  // Try object first, then array
  for (const [open, close] of [['{', '}'], ['[', ']']] as const) {
    const start = text.indexOf(open)
    const end   = text.lastIndexOf(close)
    if (start !== -1 && end > start) {
      return text.slice(start, end + 1)
    }
  }

  return text
}

export interface SafeParseResult<T> {
  /** Parsed value, or null if parsing failed */
  data:  T | null
  /** Human-readable parse error, or null on success */
  error: string | null
  /** The raw string that was passed in (before any stripping) */
  raw:   string
}

/**
 * Full pipeline:
 *   1. Strip code fences
 *   2. Extract first JSON object / array
 *   3. Attempt JSON.parse
 *   4. Attempt one repair pass (trailing commas, JS comments) on failure
 *
 * Never throws. Returns `{ data: null, error: '...' }` on failure.
 *
 * @example
 *   const { data, error } = safeParseGeminiJson<MyType>(rawText)
 *   if (error) handleError(error)
 */
export function safeParseGeminiJson<T = unknown>(input: string): SafeParseResult<T> {
  const raw = input

  if (!input?.trim()) {
    return { data: null, error: 'Gemini returned an empty response', raw }
  }

  // 1. Strip code fences
  const stripped = stripCodeFences(input)

  // 2. Extract JSON boundaries
  const extracted = extractJsonObject(stripped)

  // 3. First parse attempt
  try {
    const data = JSON.parse(extracted) as T
    return { data, error: null, raw }
  } catch { /* fall through to repair */ }

  // 4. Repair pass: remove trailing commas and JS-style comments
  const repaired = extracted
    .replace(/,\s*([\]}])/g, '$1')          // trailing commas
    .replace(/\/\/[^\n]*/g, '')              // single-line JS comments
    .replace(/\/\*[\s\S]*?\*\//g, '')        // block comments

  try {
    const data = JSON.parse(repaired) as T
    return { data, error: null, raw }
  } catch (err) {
    const preview = extracted.slice(0, 120).replace(/\n/g, '↵')
    return {
      data:  null,
      error: `Gemini returned invalid JSON: ${err instanceof Error ? err.message : String(err)}. Preview: ${preview}`,
      raw,
    }
  }
}
