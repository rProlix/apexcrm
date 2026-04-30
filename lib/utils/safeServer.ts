/**
 * Wraps an async server function in a try-catch.
 * Logs the error with a label so it's easy to find in Vercel Function logs.
 * Returns null on failure instead of crashing the server component.
 */
export async function safeServer<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T | null> {
  try {
    return await fn()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`SERVER ERROR [${label}]:`, message)
    return null
  }
}
