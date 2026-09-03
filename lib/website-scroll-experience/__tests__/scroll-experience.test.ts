import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildScrollExperienceIdempotencyKey,
  buildScrollExperienceObjectKey,
  isMp4Signature,
  SCROLL_EXPERIENCE_MAX_UPLOAD_BYTES,
  SCROLL_EXPERIENCE_MEDIA_BUCKET,
  SCROLL_EXPERIENCE_SOURCE_BUCKET,
  scrollExperienceJobSchema,
} from '../contracts'
import { normalizeScrollExperienceContent, safeScrollLink } from '../types'
import { clampProgress, mapScrollProgressToTime, shouldUseBlobMode } from '../runtime'
import { collectScrollExperienceBindings, findScrollExperienceBinding } from '../bindings'
import { SECTION_TYPES } from '@/lib/builder/defaults'

const tenantId = '11111111-1111-4111-8111-111111111111'
const experienceId = '22222222-2222-4222-8222-222222222222'
const versionId = '33333333-3333-4333-8333-333333333333'
const sourceAssetId = '44444444-4444-4444-8444-444444444444'

test('storage keys are tenant scoped and never accept a browser path', () => {
  assert.equal(
    buildScrollExperienceObjectKey({
      tenantId,
      experienceId,
      experienceVersionId: versionId,
      kind: 'source',
    }),
    `tenants/${tenantId}/website-builder/scroll-experiences/${experienceId}/${versionId}/source/original.mp4`
  )
  assert.equal(
    buildScrollExperienceObjectKey({
      tenantId,
      experienceId,
      experienceVersionId: versionId,
      kind: 'poster',
    }).endsWith('/poster/poster.webp'),
    true
  )
})

test('job contract binds tenant, experience, source and processing version', () => {
  const idempotencyKey = buildScrollExperienceIdempotencyKey(
    tenantId,
    experienceId,
    'scroll-video-v1'
  )
  assert.equal(
    scrollExperienceJobSchema.safeParse({
      version: '1',
      jobType: 'scroll_experience_video',
      tenantId,
      experienceId,
      experienceVersionId: versionId,
      sourceAssetId,
      processingVersion: 'scroll-video-v1',
      idempotencyKey,
    }).success,
    true
  )
  assert.equal(
    scrollExperienceJobSchema.safeParse({
      version: '1',
      jobType: 'scroll_experience_video',
      tenantId: 'other',
      experienceId,
      experienceVersionId: versionId,
      sourceAssetId,
      processingVersion: 'scroll-video-v1',
      idempotencyKey,
    }).success,
    false
  )
})

test('MP4 validation uses container magic bytes rather than extension', () => {
  assert.equal(
    isMp4Signature(Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109])),
    true
  )
  assert.equal(
    isMp4Signature(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 74, 70, 73, 70, 0, 0, 0, 0])),
    false
  )
})

test('Scroll MP4 uses private Supabase Storage with a hard 10 MB source limit', () => {
  assert.equal(SCROLL_EXPERIENCE_MAX_UPLOAD_BYTES, 10 * 1024 * 1024)
  assert.equal(SCROLL_EXPERIENCE_SOURCE_BUCKET, 'scroll-experience-sources')
  assert.equal(SCROLL_EXPERIENCE_MEDIA_BUCKET, 'scroll-experience-media')

  const migration = readFileSync(
    'supabase/migrations/20260831053000_scroll_experience_supabase_storage.sql',
    'utf8'
  )
  const server = readFileSync('lib/website-scroll-experience/server.ts', 'utf8')
  const worker = readFileSync(
    'workers/van-damage-worker/src/scroll-experience-processor.ts',
    'utf8'
  )
  assert.match(migration, /scroll-experience-sources/)
  assert.match(migration, /10485760/)
  assert.match(migration, /public, file_size_limit/)
  assert.match(server, /createSignedUploadUrl/)
  assert.match(server, /storage_provider: 'supabase'/)
  assert.match(worker, /downloadSupabase/)
  assert.match(worker, /uploadSupabase/)
})

test('scroll mapping clamps, trims and reverses', () => {
  assert.equal(clampProgress(-2), 0)
  assert.equal(clampProgress(2), 1)
  assert.equal(
    mapScrollProgressToTime({ progress: 0.5, duration: 20, startTime: 4, endTime: 14 }),
    9
  )
  assert.equal(
    mapScrollProgressToTime({
      progress: 0.25,
      duration: 20,
      startTime: 4,
      endTime: 12,
      reverse: true,
    }),
    10
  )
})

test('Blob mode is bounded by derivative size', () => {
  assert.equal(shouldUseBlobMode(10_000, 20_000), true)
  assert.equal(shouldUseBlobMode(30_000, 20_000), false)
  assert.equal(shouldUseBlobMode(undefined, 20_000), false)
})

test('content normalization clamps unsafe values and preserves accessible beats', () => {
  const value = normalizeScrollExperienceContent({
    scrollDistanceVh: 99999,
    overlayOpacity: -2,
    direction: 'reverse',
    beats: [{ id: 'intro', startProgress: -0.2, endProgress: 1.4, title: 'Intro' }],
  })
  assert.equal(value.scrollDistanceVh, 1000)
  assert.equal(value.overlayOpacity, 0)
  assert.equal(value.direction, 'reverse')
  assert.equal(value.previewInteraction, true)
  assert.deepEqual(
    value.beats.map((beat) => [beat.id, beat.startProgress, beat.endProgress, beat.title]),
    [['intro', 0, 1, 'Intro']]
  )
})

test('live preview can still be explicitly disabled', () => {
  assert.equal(
    normalizeScrollExperienceContent({ previewInteraction: false }).previewInteraction,
    false
  )
})

test('published bindings only come from visible Scroll Experience sections', () => {
  const snapshot = {
    pages: [
      {
        sections: [
          {
            id: 'component-a',
            section_type: 'scroll_experience',
            is_visible: true,
            content: { experienceId, experienceVersionId: versionId },
          },
          {
            id: 'component-b',
            section_type: 'scroll_experience',
            is_visible: false,
            content: { experienceId: 'hidden', experienceVersionId: 'hidden' },
          },
          {
            id: 'component-c',
            section_type: 'hero',
            content: { experienceId: 'not-scroll', experienceVersionId: 'not-scroll' },
          },
        ],
      },
    ],
  }
  const bindings = collectScrollExperienceBindings(snapshot)
  assert.deepEqual(bindings, [
    { experienceId, experienceVersionId: versionId, componentInstanceId: 'component-a' },
  ])
  assert.deepEqual(findScrollExperienceBinding(snapshot, versionId, 'component-a'), bindings[0])
  assert.equal(findScrollExperienceBinding(snapshot, versionId, 'component-b'), null)
})

test('story links reject executable and protocol-relative URLs', () => {
  assert.equal(safeScrollLink('javascript:alert(1)'), '')
  assert.equal(safeScrollLink('//attacker.example/path'), '')
  assert.equal(safeScrollLink('/contact'), '/contact')
  assert.equal(safeScrollLink('https://example.com/contact'), 'https://example.com/contact')
})

test('the Website Builder exposes Scroll Experience as a prominent upload workflow', () => {
  assert.equal(SECTION_TYPES[1]?.type, 'scroll_experience')
  assert.equal(SECTION_TYPES[1]?.label, 'Cinematic Scroll')

  const navigation = readFileSync('components/website/WebsiteBuilderNav.tsx', 'utf8')
  const workspace = readFileSync(
    'components/website/scroll-experience/ScrollVideoWorkspace.tsx',
    'utf8'
  )
  const sectionsPanel = readFileSync('components/website/SectionsPanel.tsx', 'utf8')
  assert.match(navigation, /href: '\/website\/scroll-video'/)
  assert.match(navigation, /label: 'Cinematic Scroll'/)
  assert.match(workspace, /Choose MP4 video/)
  assert.match(workspace, /Up to 10 MB/)
  assert.match(workspace, /Add to page/)
  assert.match(sectionsPanel, /Open Cinematic Scroll/)

  const sidebar = readFileSync('components/shell/Sidebar.tsx', 'utf8')
  assert.match(sidebar, /label: 'Cinematic Scroll'/)
  assert.match(sidebar, /href: '\/website\/scroll-video'/)
})

test('published Scroll Experience keeps sticky positioning compatible wrappers', () => {
  const frame = readFileSync('components/site/PremiumSectionFrame.tsx', 'utf8')
  const renderer = readFileSync('components/site/SafeSectionRenderer.tsx', 'utf8')

  assert.match(frame, /isScrollExperience \? 'visible' : 'hidden'/)
  assert.match(frame, /isScrollExperience \|\|/)
  assert.match(renderer, /normalized\.type !== 'scroll_experience'/)
})
