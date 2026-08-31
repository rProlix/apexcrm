import assert from 'node:assert/strict'
import test from 'node:test'
import { parseProbe, scaleFilter } from '../src/scroll-experience-processor.js'

test('ffprobe metadata parses duration, rotation and audio', () => {
  const metadata = parseProbe({
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        width: 1920,
        height: 1080,
        duration: '12.5',
        avg_frame_rate: '30000/1001',
        pix_fmt: 'yuv420p',
        tags: { rotate: '90' },
      },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
    format: { duration: '12.5', bit_rate: '8000000' },
  })
  assert.equal(metadata.duration, 12.5)
  assert.equal(metadata.width, 1920)
  assert.equal(metadata.rotation, 90)
  assert.equal(metadata.hasAudio, true)
  assert.ok(metadata.fps > 29.9 && metadata.fps < 30)
})

test('encode filter never upscales and uses one MP4, not a frame sequence', () => {
  assert.equal(scaleFilter(720), "scale=w='min(iw,720)':h=-2:flags=lanczos")
})
