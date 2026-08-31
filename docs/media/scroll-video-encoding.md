# Scroll video encoding

The source MP4 is preserved privately and never delivered to public visitors. FFprobe records duration, dimensions, frame rate, codec, pixel format, rotation, bitrate, audio presence, and bytes. MIME, MP4 magic bytes, codec, duration, dimensions, size, and output probes are validated.

Desktop output uses H.264/libx264, slow preset, CRF 20, yuv420p, GOP/keyint 8, scene-cut keyframes disabled, faststart, no audio, and a non-upscaling Lanczos scale capped at 1920 pixels wide by default.

Mobile output uses H.264/libx264, slow preset, CRF 23, yuv420p, GOP/keyint 4, scene-cut keyframes disabled, faststart, no audio, and a non-upscaling 720-pixel width cap by default.

The poster is one WebP selected from a short thumbnail sample near the beginning, avoiding reliance on a black frame at time zero. Poster generation is the only routine frame extraction. Runtime delivery always scrubs an MP4; no JPEG/PNG/WebP frame sequence is generated.

Derived object keys are immutable by experience version. Public media resolution checks the active published binding, then issues a short-lived signed S3 redirect with immutable response caching and byte-range support. Small derivatives may be fetched as a Blob; large derivatives stream directly.
