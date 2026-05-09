// lib/email/types.ts
// Shared TypeScript types for the Nexora email delivery layer.
// Supabase Auth remains the source of truth for sessions and auth state.
// This layer handles app-level transactional and marketing email delivery.

export type EmailProvider = 'resend' | 'ses'

export type EmailCategory =
  | 'auth'
  | 'invite'
  | 'appointment'
  | 'transaction'
  | 'order'
  | 'reward'
  | 'marketing'
  | 'notification'

export interface EmailPayload {
  /** One or more recipient addresses */
  to:          string | string[]
  subject:     string
  html:        string
  text?:       string
  /** Override sender name (falls back to config) */
  fromName?:   string
  /** Override sender address (falls back to config) */
  fromAddress?: string
  /** Override reply-to (falls back to config) */
  replyTo?:    string
  category:    EmailCategory
  tenantId?:   string
  userId?:     string
  customerId?: string
  metadata?:   Record<string, unknown>
  /** Key-value tags forwarded to the provider for analytics */
  tags?:       Record<string, string>
  /** Idempotency key — providers that support it will deduplicate */
  idempotencyKey?: string
}

export interface EmailResult {
  success:    boolean
  provider:   EmailProvider
  messageId?: string
  error?:     string
  /** Raw provider response (only logged server-side, never surfaced to client) */
  raw?:       unknown
}

export interface TemplateResult {
  subject: string
  html:    string
  text:    string
}

export interface EmailConfig {
  provider:              EmailProvider
  fromName:              string
  fromAddress:           string
  replyTo:               string
  transactionalEnabled:  boolean
  marketingEnabled:      boolean
  logLevel:              'silent' | 'error' | 'info' | 'debug'
  // Resend
  resendApiKey?:         string
  // SES
  sesRegion?:            string
  sesAccessKeyId?:       string
  sesSecretAccessKey?:   string
  sesConfigurationSet?:  string
  sesFromArn?:           string
}
