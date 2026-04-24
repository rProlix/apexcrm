import { z } from 'zod'

// ─── Common field schemas ─────────────────────────────────────────

export const uuidSchema = z.string().uuid()

export const emailSchema = z.string().email().toLowerCase().trim()

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number')
  .optional()

export const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes')

export const moduleKeySchema = z.enum([
  'payments',
  'appointments',
  'rewards',
  'vehicles',
  'damage_ai',
  'leads',
  'messages',
  'contacts',
])

// ─── Entity schemas ───────────────────────────────────────────────

export const customerSchema = z.object({
  name:  z.string().min(1).max(128),
  email: emailSchema.optional(),
  phone: phoneSchema,
  metadata: z.record(z.unknown()).optional().default({}),
})

export const leadSchema = z.object({
  name:   z.string().min(1).max(128),
  email:  emailSchema.optional(),
  phone:  phoneSchema,
  source: z.string().max(64).optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'lost', 'converted']).default('new'),
  payload: z.record(z.unknown()).optional().default({}),
})

export const appointmentSchema = z.object({
  customer_id:  uuidSchema.optional(),
  contact_id:   uuidSchema.optional(),
  service_name: z.string().min(1).max(128),
  starts_at:    z.string().datetime(),
  ends_at:      z.string().datetime(),
  status:       z.enum(['scheduled', 'confirmed', 'cancelled', 'completed', 'no_show']).default('scheduled'),
  notes:        z.string().max(2048).optional(),
})

export const vehicleSchema = z.object({
  name:         z.string().min(1).max(128),
  plate_number: z.string().max(32).optional(),
  vin:          z.string().max(17).optional(),
  status:       z.enum(['available', 'rented', 'maintenance', 'retired']).default('available'),
  metadata:     z.record(z.unknown()).optional().default({}),
})

export const tenantBrandingSchema = z.object({
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logo_url:      z.string().url().nullable().optional(),
  accent:        z.string().optional(),
  industry:      z.string().optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────

export function safeParseOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const message = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
    throw new Error(`Validation error: ${message}`)
  }
  return result.data
}
