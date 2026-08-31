import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AWS_REGION: z.string().min(1),
  VAN_DAMAGE_SQS_QUEUE_URL: z.string().url(),
  VAN_DAMAGE_S3_BUCKET: z.string().min(3),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.6-flash'),
  SLACK_TOKEN_ENCRYPTION_KEY: z.string().min(1),
  VAN_DAMAGE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
  VAN_DAMAGE_VISIBILITY_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  VAN_DAMAGE_MAX_IMAGE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 * 1024),
  VAN_DAMAGE_MAX_GEMINI_RAW_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(12 * 1024 * 1024),
  SCROLL_VIDEO_PROCESSING_CONCURRENCY: z.coerce.number().int().min(1).max(2).default(1),
  SCROLL_VIDEO_MAX_DURATION_SECONDS: z.coerce.number().int().min(1).default(180),
  SCROLL_VIDEO_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  SCROLL_VIDEO_MAX_SOURCE_WIDTH: z.coerce.number().int().min(320).default(3840),
  SCROLL_VIDEO_MAX_SOURCE_HEIGHT: z.coerce.number().int().min(320).default(3840),
  SCROLL_VIDEO_DESKTOP_MAX_WIDTH: z.coerce.number().int().min(320).default(1920),
  SCROLL_VIDEO_MOBILE_MAX_WIDTH: z.coerce.number().int().min(320).default(720),
  SCROLL_VIDEO_MIN_FREE_DISK_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(2 * 1024 * 1024 * 1024),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export type WorkerConfig = {
  nodeEnv: 'development' | 'test' | 'production'
  awsRegion: string
  queueUrl: string
  bucket: string
  supabaseUrl: string
  supabaseServiceRoleKey: string
  geminiApiKey: string
  geminiModel: string
  encryptionKey: string
  concurrency: number
  visibilityTimeoutSeconds: number
  maxImageBytes: number
  maxGeminiRawBytes: number
  scrollProcessingConcurrency: number
  scrollMaxDurationSeconds: number
  scrollMaxUploadBytes: number
  scrollMaxSourceWidth: number
  scrollMaxSourceHeight: number
  scrollDesktopMaxWidth: number
  scrollMobileMaxWidth: number
  scrollMinFreeDiskBytes: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

let cached: WorkerConfig | null = null

export function getConfig(): WorkerConfig {
  if (cached) return cached
  const env = schema.parse({
    ...process.env,
    VAN_DAMAGE_SQS_QUEUE_URL: process.env.SQS_QUEUE_URL ?? process.env.VAN_DAMAGE_SQS_QUEUE_URL,
    VAN_DAMAGE_S3_BUCKET: process.env.S3_BUCKET ?? process.env.VAN_DAMAGE_S3_BUCKET,
    GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY,
  })
  cached = {
    nodeEnv: env.NODE_ENV,
    awsRegion: env.AWS_REGION,
    queueUrl: env.VAN_DAMAGE_SQS_QUEUE_URL,
    bucket: env.VAN_DAMAGE_S3_BUCKET,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    encryptionKey: env.SLACK_TOKEN_ENCRYPTION_KEY,
    concurrency: env.VAN_DAMAGE_WORKER_CONCURRENCY,
    visibilityTimeoutSeconds: env.VAN_DAMAGE_VISIBILITY_TIMEOUT_SECONDS,
    maxImageBytes: env.VAN_DAMAGE_MAX_IMAGE_BYTES,
    maxGeminiRawBytes: env.VAN_DAMAGE_MAX_GEMINI_RAW_BYTES,
    scrollProcessingConcurrency: env.SCROLL_VIDEO_PROCESSING_CONCURRENCY,
    scrollMaxDurationSeconds: env.SCROLL_VIDEO_MAX_DURATION_SECONDS,
    scrollMaxUploadBytes: Math.min(env.SCROLL_VIDEO_MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
    scrollMaxSourceWidth: env.SCROLL_VIDEO_MAX_SOURCE_WIDTH,
    scrollMaxSourceHeight: env.SCROLL_VIDEO_MAX_SOURCE_HEIGHT,
    scrollDesktopMaxWidth: env.SCROLL_VIDEO_DESKTOP_MAX_WIDTH,
    scrollMobileMaxWidth: env.SCROLL_VIDEO_MOBILE_MAX_WIDTH,
    scrollMinFreeDiskBytes: env.SCROLL_VIDEO_MIN_FREE_DISK_BYTES,
    logLevel: env.LOG_LEVEL,
  }
  return cached
}
