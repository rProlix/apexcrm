// lib/website-ai/security.ts
// Sanitizes pasted input before sending to Gemini.
// Detects secrets, keys, SSNs, credit cards, etc. and blocks the call.

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'API key',          pattern: /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { name: 'JWT token',        pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'private key',      pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'AWS key',          pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'Stripe secret',    pattern: /sk_(live|test)_[A-Za-z0-9]{24,}/ },
  { name: 'Stripe publishable', pattern: /pk_(live|test)_[A-Za-z0-9]{24,}/ },
  { name: 'Supabase service', pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{50,}/ },
  { name: 'Vercel token',     pattern: /vercel_[A-Za-z0-9]{20,}/ },
  { name: 'GitHub token',     pattern: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'credit card',      pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/ },
  { name: 'SSN',              pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'password field',   pattern: /password\s*[:=]\s*\S+/i },
  { name: 'secret field',     pattern: /secret\s*[:=]\s*[^\s]{8,}/i },
  { name: 'generic API key',  pattern: /api[_-]?key\s*[:=]\s*[^\s]{16,}/i },
  { name: 'Square token',     pattern: /sq0[a-z]{3}-[A-Za-z0-9_-]{22,}/ },
]

export interface SecurityCheckResult {
  safe:    boolean
  reason?: string
}

export function checkInputSecurity(text: string): SecurityCheckResult {
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      return {
        safe:   false,
        reason: `This text appears to contain sensitive information (detected: ${name}). Remove secrets, payment details, passwords, or private customer data before analyzing.`,
      }
    }
  }
  return { safe: true }
}

export function sanitizeInput(text: string): string {
  // Trim and collapse extreme whitespace but preserve structure
  return text.trim().replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').substring(0, 20_000)
}
