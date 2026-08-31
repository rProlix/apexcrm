type Missing = string[]

function required(name: string, missing: Missing): string {
  const value = process.env[name]?.trim()
  if (!value) missing.push(name)
  return value ?? ''
}

function requiredAny(names: string[], missing: Missing): string {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  missing.push(names.join(' or '))
  return ''
}

function finish<T>(feature: string, missing: Missing, value: T): T {
  if (missing.length) {
    throw new Error(
      `[Van Damage AI:${feature}] Missing server environment variables: ${missing.join(', ')}`
    )
  }
  return value
}

export function getVanDamageSupabaseEnv() {
  const missing: Missing = []
  const url = process.env.SUPABASE_URL?.trim() || required('NEXT_PUBLIC_SUPABASE_URL', missing)
  const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY', missing)
  return finish('supabase', missing, { url, serviceRoleKey })
}

export function getSlackOAuthEnv() {
  const missing: Missing = []
  const clientId = required('SLACK_CLIENT_ID', missing)
  const clientSecret = required('SLACK_CLIENT_SECRET', missing)
  const encryptionKey = required('SLACK_TOKEN_ENCRYPTION_KEY', missing)
  const appUrl = required('NEXT_PUBLIC_APP_URL', missing).replace(/\/$/, '')
  return finish('slack-oauth', missing, { clientId, clientSecret, encryptionKey, appUrl })
}

export function getSlackEventsEnv() {
  const missing: Missing = []
  const signingSecret = required('SLACK_SIGNING_SECRET', missing)
  return finish('slack-events', missing, { signingSecret })
}

export function getVanDamageAwsEnv() {
  const missing: Missing = []
  const region = required('AWS_REGION', missing)
  const queueUrl = requiredAny(['VAN_DAMAGE_SQS_QUEUE_URL', 'SQS_QUEUE_URL'], missing)
  const bucket = requiredAny(['VAN_DAMAGE_S3_BUCKET', 'S3_BUCKET'], missing)
  return finish('aws', missing, { region, queueUrl, bucket })
}

export function getScrollExperienceAwsEnv() {
  const missing: Missing = []
  const region = required('AWS_REGION', missing)
  const queueUrl = requiredAny(['VAN_DAMAGE_SQS_QUEUE_URL', 'SQS_QUEUE_URL'], missing)
  const bucket = requiredAny(['VAN_DAMAGE_S3_BUCKET', 'S3_BUCKET'], missing)
  return finish('scroll-experience', missing, { region, queueUrl, bucket })
}

export function getScrollExperienceQueueEnv() {
  const missing: Missing = []
  const region = required('AWS_REGION', missing)
  const queueUrl = requiredAny(['VAN_DAMAGE_SQS_QUEUE_URL', 'SQS_QUEUE_URL'], missing)
  return finish('scroll-experience-queue', missing, { region, queueUrl })
}

export function getScrollExperienceLimits() {
  const number = (name: string, fallback: number) => {
    const parsed = Number(process.env[name])
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
  }
  return {
    maxUploadBytes: Math.min(
      number('SCROLL_VIDEO_MAX_UPLOAD_BYTES', 10 * 1024 * 1024),
      10 * 1024 * 1024
    ),
    maxDurationSeconds: number('SCROLL_VIDEO_MAX_DURATION_SECONDS', 180),
    maxSourceWidth: number('SCROLL_VIDEO_MAX_SOURCE_WIDTH', 3840),
    maxSourceHeight: number('SCROLL_VIDEO_MAX_SOURCE_HEIGHT', 3840),
    blobMaxBytes: number('SCROLL_VIDEO_BLOB_MAX_BYTES', 32 * 1024 * 1024),
    desktopMaxWidth: number('SCROLL_VIDEO_DESKTOP_MAX_WIDTH', 1920),
    mobileMaxWidth: number('SCROLL_VIDEO_MOBILE_MAX_WIDTH', 720),
    processingVersion: process.env.SCROLL_VIDEO_PROCESSING_VERSION?.trim() || 'scroll-video-v1',
  }
}

export function getVanDamageGeminiEnv() {
  const missing: Missing = []
  const apiKey = requiredAny(['GEMINI_API_KEY', 'GOOGLE_GEMINI_API_KEY'], missing)
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
  return finish('gemini', missing, { apiKey, model })
}

export function getVanDamageConfigPresence() {
  const present = (name: string) => Boolean(process.env[name]?.trim())
  return {
    awsRegion: present('AWS_REGION'),
    sqsQueue: present('VAN_DAMAGE_SQS_QUEUE_URL') || present('SQS_QUEUE_URL'),
    s3Bucket: present('VAN_DAMAGE_S3_BUCKET') || present('S3_BUCKET'),
    slackOAuth: present('SLACK_CLIENT_ID') && present('SLACK_CLIENT_SECRET'),
    slackSigning: present('SLACK_SIGNING_SECRET'),
    tokenEncryption: present('SLACK_TOKEN_ENCRYPTION_KEY'),
    supabase:
      (present('SUPABASE_URL') || present('NEXT_PUBLIC_SUPABASE_URL')) &&
      present('SUPABASE_SERVICE_ROLE_KEY'),
    aiAnalysis: present('GEMINI_API_KEY') || present('GOOGLE_GEMINI_API_KEY'),
  }
}
