import { createReadStream } from 'node:fs'
import { mkdtemp, open, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  buildScrollExperienceObjectKey,
  isMp4Signature,
  SCROLL_EXPERIENCE_MEDIA_BUCKET,
  scrollExperienceJobSchema,
  type ScrollExperienceJobV1,
} from '../../../lib/website-scroll-experience/contracts.js'
import type { WorkerConfig } from './config.js'
import { logger } from './logger.js'
import type { ProcessResult } from './process-job.js'

type Probe = {
  streams?: Array<Record<string, unknown>>
  format?: Record<string, unknown>
}

type VideoMetadata = {
  duration: number
  width: number
  height: number
  fps: number
  codec: string
  pixelFormat: string | null
  rotation: number
  bitrate: number | null
  hasAudio: boolean
}

let activeScrollJobs = 0

export async function withScrollProcessingSlot<T>(
  limit: number,
  work: () => Promise<T>
): Promise<T | null> {
  // Do not hold an SQS message invisible while it waits behind a long encode.
  // Returning null lets the queue make it visible again for a later receive.
  if (activeScrollJobs >= limit) return null
  activeScrollJobs++
  try {
    return await work()
  } finally {
    activeScrollJobs--
  }
}

function database(config: WorkerConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function run(command: string, args: string[], maxOutputBytes = 2_000_000) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      outputBytes += chunk.length
      if (outputBytes <= maxOutputBytes) target.push(chunk)
    }
    child.stdout.on('data', collect(stdout))
    child.stderr.on('data', collect(stderr))
    child.once('error', reject)
    child.once('close', (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }
      if (code === 0) resolve(result)
      else reject(new Error(`${command} exited with code ${code}: ${result.stderr.slice(-600)}`))
    })
  })
}

function fraction(value: unknown) {
  if (typeof value !== 'string') return Number(value) || 0
  const [a, b] = value.split('/').map(Number)
  return b ? a / b : a || 0
}

export function parseProbe(probe: Probe): VideoMetadata {
  const video = probe.streams?.find((stream) => stream.codec_type === 'video')
  if (!video) throw new Error('UNSUPPORTED_VIDEO:no_video_stream')
  const width = Number(video.width ?? 0)
  const height = Number(video.height ?? 0)
  const duration = Number(video.duration ?? probe.format?.duration ?? 0)
  const tags =
    video.tags && typeof video.tags === 'object' ? (video.tags as Record<string, unknown>) : {}
  const sideData = Array.isArray(video.side_data_list)
    ? (video.side_data_list as Array<Record<string, unknown>>)
    : []
  const rotation = Number(
    tags.rotate ?? sideData.find((item) => item.rotation != null)?.rotation ?? 0
  )
  return {
    duration,
    width,
    height,
    fps: fraction(video.avg_frame_rate ?? video.r_frame_rate),
    codec: String(video.codec_name ?? ''),
    pixelFormat: typeof video.pix_fmt === 'string' ? video.pix_fmt : null,
    rotation: Number.isFinite(rotation) ? rotation : 0,
    bitrate: Number.isFinite(Number(video.bit_rate ?? probe.format?.bit_rate))
      ? Number(video.bit_rate ?? probe.format?.bit_rate)
      : null,
    hasAudio: Boolean(probe.streams?.some((stream) => stream.codec_type === 'audio')),
  }
}

async function probe(file: string) {
  const result = await run('ffprobe', [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    file,
  ])
  return parseProbe(JSON.parse(result.stdout) as Probe)
}

function validateSource(meta: VideoMetadata, bytes: number, config: WorkerConfig) {
  if (
    !Number.isFinite(meta.duration) ||
    meta.duration <= 0 ||
    meta.duration > config.scrollMaxDurationSeconds
  )
    throw new Error('LIMIT_DURATION')
  if (
    !meta.width ||
    !meta.height ||
    meta.width > config.scrollMaxSourceWidth ||
    meta.height > config.scrollMaxSourceHeight
  )
    throw new Error('LIMIT_DIMENSIONS')
  if (bytes <= 0 || bytes > config.scrollMaxUploadBytes) throw new Error('LIMIT_BYTES')
  if (!['h264', 'hevc', 'mpeg4', 'vp9', 'av1'].includes(meta.codec))
    throw new Error('UNSUPPORTED_CODEC')
}

export function scaleFilter(maxWidth: number) {
  return `scale=w='min(iw,${maxWidth})':h=-2:flags=lanczos`
}

async function encode(input: string, output: string, maxWidth: number, crf: number, gop: number) {
  await run(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input,
      '-map',
      '0:v:0',
      '-an',
      '-vf',
      scaleFilter(maxWidth),
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      String(crf),
      '-pix_fmt',
      'yuv420p',
      '-g',
      String(gop),
      '-keyint_min',
      String(gop),
      '-sc_threshold',
      '0',
      '-movflags',
      '+faststart',
      output,
    ],
    4_000_000
  )
}

async function createPoster(input: string, output: string, duration: number) {
  const at = Math.min(2, Math.max(0.2, duration * 0.03))
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    at.toFixed(3),
    '-i',
    input,
    '-map',
    '0:v:0',
    '-frames:v',
    '1',
    '-vf',
    "thumbnail=12,scale=w='min(iw,1600)':h=-2:flags=lanczos",
    '-c:v',
    'libwebp',
    '-quality',
    '82',
    output,
  ])
}

async function downloadS3(client: S3Client, bucket: string, key: string, target: string) {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!response.Body) throw new Error('SOURCE_MISSING')
  const body = response.Body as Readable
  await pipeline(
    body,
    await import('node:fs').then(({ createWriteStream }) =>
      createWriteStream(target, { flags: 'wx' })
    )
  )
}

async function downloadSupabase(
  client: SupabaseClient,
  bucket: string,
  key: string,
  target: string
) {
  const { data, error } = await client.storage.from(bucket).download(key)
  if (error || !data) throw new Error('SOURCE_MISSING')
  await writeFile(target, Buffer.from(await data.arrayBuffer()), { flag: 'wx' })
}

async function uploadS3(
  client: S3Client,
  input: {
    bucket: string
    key: string
    file: string
    contentType: string
    tenantId: string
    experienceId: string
    versionId: string
    kind: string
  }
) {
  const fileStat = await stat(input.file)
  await client.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: createReadStream(input.file),
      ContentLength: fileStat.size,
      ContentType: input.contentType,
      CacheControl: 'private, max-age=31536000, immutable',
      Metadata: {
        tenant_id: input.tenantId,
        experience_id: input.experienceId,
        experience_version_id: input.versionId,
        asset_kind: input.kind,
      },
      Tagging: new URLSearchParams({
        'tenant-id': input.tenantId,
        'asset-type': `scroll-${input.kind}`,
        'retention-class': input.kind === 'source' ? 'source' : 'published-derivative',
        'legal-hold': 'false',
      }).toString(),
    })
  )
  return fileStat.size
}

async function uploadSupabase(
  client: SupabaseClient,
  input: { bucket: string; key: string; file: string; contentType: string }
) {
  const fileStat = await stat(input.file)
  const { error } = await client.storage
    .from(input.bucket)
    .upload(input.key, createReadStream(input.file), {
      contentType: input.contentType,
      cacheControl: '31536000',
      upsert: true,
    })
  if (error) throw new Error('SUPABASE_STORAGE_UPLOAD_FAILED')
  return fileStat.size
}

async function readSignature(file: string) {
  const handle = await open(file, 'r')
  try {
    const signature = Buffer.alloc(16)
    const { bytesRead } = await handle.read(signature, 0, signature.length, 0)
    return signature.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

async function setStage(db: SupabaseClient, job: ScrollExperienceJobV1, status: string) {
  await Promise.all([
    db
      .from('website_scroll_experience_versions')
      .update({ status })
      .eq('id', job.experienceVersionId)
      .eq('tenant_id', job.tenantId),
    db
      .from('website_scroll_experiences')
      .update({ status })
      .eq('id', job.experienceId)
      .eq('tenant_id', job.tenantId),
  ])
}

function errorCategory(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('LIMIT_')) return message.split(':')[0].slice(0, 80)
  if (message.includes('UNSUPPORTED')) return message.split(':')[0].slice(0, 80)
  if (message.includes('ffprobe')) return 'FFPROBE_FAILED'
  if (message.includes('ffmpeg')) return 'FFMPEG_FAILED'
  if (message.includes('ENOSPC') || message.includes('DISK')) return 'INSUFFICIENT_DISK'
  return 'PROCESSING_FAILED'
}

export async function processScrollExperienceJob(
  raw: unknown,
  config: WorkerConfig,
  metadata: { sqsMessageId?: string; retryCount?: number } = {}
): Promise<ProcessResult> {
  const parsed = scrollExperienceJobSchema.safeParse(raw)
  if (!parsed.success) {
    logger.error('Invalid Scroll Experience job', {
      messageId: metadata.sqsMessageId,
      issues: parsed.error.issues.map((issue) => issue.message),
    })
    return 'retry'
  }
  const result = await withScrollProcessingSlot(config.scrollProcessingConcurrency, () =>
    process(parsed.data, config, metadata)
  )
  if (result === null) {
    logger.info('Scroll Experience processing slot busy; releasing message for retry', {
      jobId: parsed.data.idempotencyKey,
      messageId: metadata.sqsMessageId,
    })
    return 'retry'
  }
  return result
}

async function process(
  job: ScrollExperienceJobV1,
  config: WorkerConfig,
  metadata: { sqsMessageId?: string; retryCount?: number }
): Promise<ProcessResult> {
  const startedAt = Date.now()
  const db = database(config)
  const context = {
    tenantId: job.tenantId,
    experienceId: job.experienceId,
    jobId: job.idempotencyKey,
    messageId: metadata.sqsMessageId,
  }
  const { data: row } = await db
    .from('website_scroll_experience_jobs')
    .select('id,status,claimed_at,source_asset_id')
    .eq('idempotency_key', job.idempotencyKey)
    .eq('tenant_id', job.tenantId)
    .maybeSingle()
  if (!row || row.source_asset_id !== job.sourceAssetId) {
    logger.error('Scroll Experience job ownership validation failed', context)
    return 'success'
  }
  if (row.status === 'COMPLETED') return 'success'
  if (
    row.status === 'PROCESSING' &&
    row.claimed_at &&
    Date.now() - Date.parse(row.claimed_at) < config.visibilityTimeoutSeconds * 2_000
  )
    return 'retry'

  const claimedAt = new Date().toISOString()
  await db
    .from('website_scroll_experience_jobs')
    .update({
      status: 'PROCESSING',
      claimed_at: claimedAt,
      attempts: (metadata.retryCount ?? 0) + 1,
    })
    .eq('id', row.id)
    .eq('tenant_id', job.tenantId)
  await db
    .from('website_scroll_experience_versions')
    .update({
      processing_started_at: claimedAt,
      processing_attempts: (metadata.retryCount ?? 0) + 1,
    })
    .eq('id', job.experienceVersionId)
    .eq('tenant_id', job.tenantId)
  await db.from('website_scroll_experience_audit').insert({
    tenant_id: job.tenantId,
    experience_id: job.experienceId,
    event_name: 'SCROLL_VIDEO_PROCESSING_STARTED',
    metadata: {
      processing_version: job.processingVersion,
      attempt: (metadata.retryCount ?? 0) + 1,
    },
  })

  let workDir: string | null = null
  try {
    await run('ffmpeg', ['-version'], 40_000)
    await run('ffprobe', ['-version'], 40_000)
    const disk = await statfs(tmpdir())
    if (disk.bavail * disk.bsize < config.scrollMinFreeDiskBytes)
      throw new Error('INSUFFICIENT_DISK')

    const { data: source } = await db
      .from('website_scroll_experience_assets')
      .select('id,storage_provider,bucket,object_key,bytes')
      .eq('id', job.sourceAssetId)
      .eq('tenant_id', job.tenantId)
      .eq('experience_id', job.experienceId)
      .eq('experience_version_id', job.experienceVersionId)
      .eq('kind', 'source')
      .maybeSingle()
    if (!source) throw new Error('SOURCE_OWNERSHIP_MISMATCH')

    workDir = await mkdtemp(join(tmpdir(), 'nexora-scroll-'))
    const sourceFile = join(workDir, 'source.mp4')
    const desktopFile = join(workDir, 'desktop.mp4')
    const mobileFile = join(workDir, 'mobile.mp4')
    const posterFile = join(workDir, 'poster.webp')
    const s3 = new S3Client({ region: config.awsRegion, maxAttempts: 3 })
    const storageProvider = source.storage_provider === 'supabase' ? 'supabase' : 's3'
    if (storageProvider === 'supabase') {
      await downloadSupabase(db, source.bucket, source.object_key, sourceFile)
    } else {
      await downloadS3(s3, source.bucket, source.object_key, sourceFile)
    }
    if (!isMp4Signature(await readSignature(sourceFile))) throw new Error('UNSUPPORTED_CONTAINER')

    await setStage(db, job, 'INSPECTING')
    const sourceMeta = await probe(sourceFile)
    validateSource(sourceMeta, Number(source.bytes), config)
    logger.info('Scroll Experience source inspected', {
      ...context,
      sourceBytes: source.bytes,
      width: sourceMeta.width,
      height: sourceMeta.height,
      duration: sourceMeta.duration,
      codec: sourceMeta.codec,
    })

    await setStage(db, job, 'PROCESSING_DESKTOP')
    await encode(sourceFile, desktopFile, config.scrollDesktopMaxWidth, 20, 8)
    const desktopMeta = await probe(desktopFile)

    await setStage(db, job, 'PROCESSING_MOBILE')
    await encode(sourceFile, mobileFile, config.scrollMobileMaxWidth, 23, 4)
    const mobileMeta = await probe(mobileFile)

    await setStage(db, job, 'GENERATING_POSTER')
    await createPoster(sourceFile, posterFile, sourceMeta.duration)

    const keys = {
      desktop: buildScrollExperienceObjectKey({
        tenantId: job.tenantId,
        experienceId: job.experienceId,
        experienceVersionId: job.experienceVersionId,
        kind: 'desktop',
      }),
      mobile: buildScrollExperienceObjectKey({
        tenantId: job.tenantId,
        experienceId: job.experienceId,
        experienceVersionId: job.experienceVersionId,
        kind: 'mobile',
      }),
      poster: buildScrollExperienceObjectKey({
        tenantId: job.tenantId,
        experienceId: job.experienceId,
        experienceVersionId: job.experienceVersionId,
        kind: 'poster',
      }),
    }
    const derivativeBucket =
      storageProvider === 'supabase' ? SCROLL_EXPERIENCE_MEDIA_BUCKET : source.bucket
    const uploadDerivative = (input: {
      key: string
      file: string
      contentType: string
      kind: string
    }) =>
      storageProvider === 'supabase'
        ? uploadSupabase(db, { ...input, bucket: derivativeBucket })
        : uploadS3(s3, {
            ...input,
            bucket: derivativeBucket,
            tenantId: job.tenantId,
            experienceId: job.experienceId,
            versionId: job.experienceVersionId,
          })
    const [desktopBytes, mobileBytes, posterBytes] = await Promise.all([
      uploadDerivative({
        key: keys.desktop,
        file: desktopFile,
        contentType: 'video/mp4',
        kind: 'desktop',
      }),
      uploadDerivative({
        key: keys.mobile,
        file: mobileFile,
        contentType: 'video/mp4',
        kind: 'mobile',
      }),
      uploadDerivative({
        key: keys.poster,
        file: posterFile,
        contentType: 'image/webp',
        kind: 'poster',
      }),
    ])
    const assets = [
      {
        kind: 'desktop',
        key: keys.desktop,
        contentType: 'video/mp4',
        bytes: desktopBytes,
        meta: desktopMeta,
      },
      {
        kind: 'mobile',
        key: keys.mobile,
        contentType: 'video/mp4',
        bytes: mobileBytes,
        meta: mobileMeta,
      },
      {
        kind: 'poster',
        key: keys.poster,
        contentType: 'image/webp',
        bytes: posterBytes,
        meta: { width: null, height: null, duration: null },
      },
    ]
    for (const asset of assets) {
      const { error } = await db.from('website_scroll_experience_assets').upsert(
        {
          tenant_id: job.tenantId,
          experience_id: job.experienceId,
          experience_version_id: job.experienceVersionId,
          kind: asset.kind,
          storage_provider: storageProvider,
          bucket: derivativeBucket,
          object_key: asset.key,
          content_type: asset.contentType,
          bytes: asset.bytes,
          width: asset.meta.width,
          height: asset.meta.height,
          duration_seconds: asset.meta.duration,
          metadata: { processing_version: job.processingVersion },
        },
        { onConflict: 'tenant_id,experience_version_id,kind' }
      )
      if (error) throw new Error(`ASSET_PERSIST_FAILED:${asset.kind}`)
    }

    const completedAt = new Date().toISOString()
    const processingDurationMs = Date.now() - startedAt
    await db
      .from('website_scroll_experience_versions')
      .update({
        status: 'READY',
        processed_at: completedAt,
        processing_error_category: null,
        duration_seconds: sourceMeta.duration,
        source_width: sourceMeta.width,
        source_height: sourceMeta.height,
        source_fps: sourceMeta.fps,
        source_codec: sourceMeta.codec,
        source_pixel_format: sourceMeta.pixelFormat,
        source_rotation: sourceMeta.rotation,
        source_bitrate: sourceMeta.bitrate,
        source_has_audio: sourceMeta.hasAudio,
        desktop_width: desktopMeta.width,
        desktop_height: desktopMeta.height,
        desktop_bytes: desktopBytes,
        mobile_width: mobileMeta.width,
        mobile_height: mobileMeta.height,
        mobile_bytes: mobileBytes,
        poster_bytes: posterBytes,
        processing_duration_ms: processingDurationMs,
      })
      .eq('id', job.experienceVersionId)
      .eq('tenant_id', job.tenantId)
    await db
      .from('website_scroll_experiences')
      .update({ status: 'READY', active_version_id: job.experienceVersionId })
      .eq('id', job.experienceId)
      .eq('tenant_id', job.tenantId)
    await db
      .from('website_scroll_experience_jobs')
      .update({ status: 'COMPLETED', completed_at: completedAt, last_error_category: null })
      .eq('id', row.id)
      .eq('tenant_id', job.tenantId)
    await db.from('website_scroll_experience_audit').insert({
      tenant_id: job.tenantId,
      experience_id: job.experienceId,
      event_name: 'SCROLL_VIDEO_PROCESSING_COMPLETED',
      metadata: {
        processing_duration_ms: processingDurationMs,
        desktop_bytes: desktopBytes,
        mobile_bytes: mobileBytes,
        poster_bytes: posterBytes,
      },
    })
    logger.info('Scroll Experience processing completed', {
      ...context,
      durationMs: processingDurationMs,
      sourceBytes: source.bytes,
      desktopBytes,
      mobileBytes,
      posterBytes,
    })
    return 'success'
  } catch (error) {
    const category = errorCategory(error)
    const retryable = category === 'INSUFFICIENT_DISK'
    const attempt = (metadata.retryCount ?? 0) + 1
    const willRetry = retryable && attempt < config.scrollMaxRetries
    const failureStatus = willRetry ? 'QUEUED' : 'FAILED'
    await Promise.all([
      db
        .from('website_scroll_experience_versions')
        .update({ status: failureStatus, processing_error_category: category })
        .eq('id', job.experienceVersionId)
        .eq('tenant_id', job.tenantId),
      db
        .from('website_scroll_experiences')
        .update({ status: failureStatus })
        .eq('id', job.experienceId)
        .eq('tenant_id', job.tenantId),
      db
        .from('website_scroll_experience_jobs')
        .update({
          status: failureStatus,
          claimed_at: willRetry ? null : row.claimed_at,
          last_error_category: category,
        })
        .eq('id', row.id)
        .eq('tenant_id', job.tenantId),
      db.from('website_scroll_experience_audit').insert({
        tenant_id: job.tenantId,
        experience_id: job.experienceId,
        event_name: willRetry ? 'SCROLL_VIDEO_RETRY_STARTED' : 'SCROLL_VIDEO_PROCESSING_FAILED',
        metadata: { category, attempt, automatic: willRetry },
      }),
    ])
    logger.error('Scroll Experience processing failed', {
      ...context,
      category,
      durationMs: Date.now() - startedAt,
    })
    if (willRetry) return 'retry'
    if (retryable) {
      logger.error('Scroll Experience retry limit reached; discarding message', {
        ...context,
        category,
        attempt,
        maxRetries: config.scrollMaxRetries,
      })
    }
    return 'success'
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
