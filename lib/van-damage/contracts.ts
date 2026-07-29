import { z } from 'zod'

export const VAN_DAMAGE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const vanDamageImageMimeSchema = z.enum(VAN_DAMAGE_IMAGE_MIME_TYPES)

export const vanDamageJobSchema = z
  .object({
    version: z.literal('v1'),
    jobType: z.literal('van_damage_slack_inspection'),
    jobId: z.string().uuid(),
    tenantId: z.string().uuid(),
    businessId: z.string().uuid(),
    integrationId: z.string().uuid(),
    inspectionId: z.string().uuid(),
    imageId: z.string().uuid(),
    slackFileId: z.string().min(1),
    analysisVersion: z.string().min(1).max(100).default('van-damage-v2'),
    slackTeamId: z.string().min(1),
    slackChannelId: z.string().min(1),
    slackMessageTs: z.string().min(1),
    slackThreadTs: z.string().nullable(),
    slackEventId: z.string().min(1),
    slackMessageText: z.string().max(4_000).default(''),
    slackFileIds: z.array(z.string().min(1)).length(1),
    uploadSessionId: z.string().uuid().optional(),
    uploadSourceKey: z.string().min(1).max(300).optional(),
    slackUploadIso: z.string().datetime().nullable().optional(),
    slackDriver: z
      .object({
        slackWorkspaceId: z.string().nullable(),
        slackUserId: z.string().nullable(),
        displayName: z.string().nullable().optional(),
        realName: z.string().nullable().optional(),
        username: z.string().nullable().optional(),
        avatarUrl: z.string().url().nullable().optional(),
      })
      .optional(),
    createdAt: z.string().datetime(),
  })
  .superRefine((value, context) => {
    if (value.businessId !== value.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['businessId'],
        message: 'businessId must equal tenantId in the current ApexCRM business model',
      })
    }
    if (value.slackFileIds[0] !== value.slackFileId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slackFileIds'],
        message: 'The image job must contain only its stable Slack file ID',
      })
    }
  })

export type VanDamageJobV1 = z.infer<typeof vanDamageJobSchema>

export const damageTypeSchema = z.enum([
  'dirt_debris',
  'dent',
  'scratch',
  'crack',
  'broken_light',
  'broken_mirror',
  'paint_damage',
  'bumper_damage',
  'glass_damage',
  'tire_wheel_damage',
  'interior_damage',
  'unknown',
])

export const vehicleAreaSchema = z.enum([
  'front_bumper',
  'front_bumper_driver',
  'front_bumper_passenger',
  'rear_bumper',
  'rear_bumper_driver',
  'rear_bumper_passenger',
  'driver_side',
  'passenger_side',
  'roof',
  'roof_front',
  'roof_center',
  'roof_rear',
  'driver_roof_edge',
  'passenger_roof_edge',
  'hood',
  'windshield',
  'door',
  'driver_front_door',
  'passenger_front_door',
  'driver_sliding_door',
  'passenger_sliding_door',
  'driver_rear_door',
  'passenger_rear_door',
  'driver_rear_lower_door',
  'passenger_rear_lower_door',
  'rear_door_center_seam',
  'driver_front_fender',
  'passenger_front_fender',
  'driver_cargo_panel',
  'passenger_cargo_panel',
  'driver_rear_cargo_panel',
  'passenger_rear_cargo_panel',
  'driver_rear_quarter',
  'passenger_rear_quarter',
  'driver_rocker_panel',
  'passenger_rocker_panel',
  'mirror',
  'driver_mirror',
  'passenger_mirror',
  'wheel',
  'driver_front_wheel',
  'passenger_front_wheel',
  'driver_rear_wheel',
  'passenger_rear_wheel',
  'driver_headlight',
  'passenger_headlight',
  'driver_taillight',
  'passenger_taillight',
  'upper_grille',
  'lower_grille',
  'interior',
  'unknown',
])

export const damageSeveritySchema = z.enum(['low', 'medium', 'high', 'critical', 'unknown'])

export const boundingBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .refine((box) => box.x + box.width <= 1 && box.y + box.height <= 1, {
    message: 'Bounding box must remain within normalized image coordinates',
  })

export const geminiDamageItemSchema = z
  .object({
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
  })
  .refine(
    (item) =>
      item.estimatedCostMin == null ||
      item.estimatedCostMax == null ||
      item.estimatedCostMin <= item.estimatedCostMax,
    { message: 'estimatedCostMin cannot exceed estimatedCostMax' }
  )

export const geminiDamageAnalysisSchema = z
  .object({
    summary: z.string(),
    overallConfidence: z.number().min(0).max(1),
    damageRating: z.number().int().min(0).max(3),
    damageRatingLabel: z.enum([
      'no_damage',
      'dirt_or_debris',
      'light_scratches',
      'dents_or_damage',
    ]),
    damageRatingReason: z.string(),
    damageCount: z.number().int().nonnegative(),
    vehicleCondition: z.enum(['excellent', 'good', 'fair', 'poor', 'unknown']).catch('unknown'),
    items: z.array(geminiDamageItemSchema),
    needsHumanReview: z.boolean(),
    warnings: z.array(z.string()),
  })
  .transform((value) => ({ ...value, damageCount: value.items.length }))

export type GeminiDamageAnalysis = z.infer<typeof geminiDamageAnalysisSchema>

export const inspectionStatusSchema = z.enum([
  'queued',
  'processing',
  'analyzing',
  'completed',
  'failed',
  'needs_review',
])

export type InspectionStatus = z.infer<typeof inspectionStatusSchema>
