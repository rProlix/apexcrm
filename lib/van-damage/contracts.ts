import { z } from 'zod'

export const VAN_DAMAGE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const vanDamageImageMimeSchema = z.enum(VAN_DAMAGE_IMAGE_MIME_TYPES)

export const vanDamageJobSchema = z.object({
  version: z.literal('v1'),
  jobType: z.literal('van_damage_slack_inspection'),
  jobId: z.string().uuid(),
  tenantId: z.string().uuid(),
  businessId: z.string().uuid(),
  integrationId: z.string().uuid(),
  inspectionId: z.string().uuid(),
  slackTeamId: z.string().min(1),
  slackChannelId: z.string().min(1),
  slackMessageTs: z.string().min(1),
  slackThreadTs: z.string().nullable(),
  slackEventId: z.string().min(1),
  slackFileIds: z.array(z.string().min(1)).min(1),
  createdAt: z.string().datetime(),
}).superRefine((value, context) => {
  if (value.businessId !== value.tenantId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['businessId'],
      message: 'businessId must equal tenantId in the current ApexCRM business model',
    })
  }
})

export type VanDamageJobV1 = z.infer<typeof vanDamageJobSchema>

export const damageTypeSchema = z.enum([
  'dent', 'scratch', 'crack', 'broken_light', 'broken_mirror', 'paint_damage',
  'bumper_damage', 'glass_damage', 'tire_wheel_damage', 'interior_damage', 'unknown',
])

export const vehicleAreaSchema = z.enum([
  'front_bumper', 'rear_bumper', 'driver_side', 'passenger_side', 'roof', 'hood',
  'door', 'mirror', 'wheel', 'interior', 'unknown',
])

export const damageSeveritySchema = z.enum(['low', 'medium', 'high', 'critical', 'unknown'])

export const boundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
}).refine((box) => box.x + box.width <= 1 && box.y + box.height <= 1, {
  message: 'Bounding box must remain within normalized image coordinates',
})

export const geminiDamageItemSchema = z.object({
  imageIndex: z.number().int().nonnegative(),
  damageType: damageTypeSchema.catch('unknown'),
  vehicleArea: vehicleAreaSchema.catch('unknown'),
  severity: damageSeveritySchema.catch('unknown'),
  confidence: z.number().min(0).max(1),
  description: z.string(),
  repairRecommendation: z.string(),
  estimatedCostMin: z.number().nonnegative().nullable(),
  estimatedCostMax: z.number().nonnegative().nullable(),
  boundingBox: boundingBoxSchema.nullable(),
}).refine((item) => (
  item.estimatedCostMin == null || item.estimatedCostMax == null ||
  item.estimatedCostMin <= item.estimatedCostMax
), { message: 'estimatedCostMin cannot exceed estimatedCostMax' })

export const geminiDamageAnalysisSchema = z.object({
  summary: z.string(),
  overallConfidence: z.number().min(0).max(1),
  damageCount: z.number().int().nonnegative(),
  vehicleCondition: z.enum(['excellent', 'good', 'fair', 'poor', 'unknown']).catch('unknown'),
  items: z.array(geminiDamageItemSchema),
  needsHumanReview: z.boolean(),
  warnings: z.array(z.string()),
}).transform((value) => ({ ...value, damageCount: value.items.length }))

export type GeminiDamageAnalysis = z.infer<typeof geminiDamageAnalysisSchema>

export const inspectionStatusSchema = z.enum([
  'queued', 'processing', 'analyzing', 'completed', 'failed', 'needs_review',
])

export type InspectionStatus = z.infer<typeof inspectionStatusSchema>
