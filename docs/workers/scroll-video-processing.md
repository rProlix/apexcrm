# Scroll video processing worker

`scroll_experience_video` is a routed job in the existing EC2 worker and SQS consumer. It does not start another daemon. Existing visibility heartbeats protect long encodes, and `SCROLL_VIDEO_PROCESSING_CONCURRENCY` defaults to 1 so FFmpeg does not starve image analysis jobs.

The job contract contains only `tenantId`, `experienceId`, `experienceVersionId`, `sourceAssetId`, processing version, and the tenant/experience/version idempotency key. The processor validates every association with tenant predicates before downloading. Duplicate completed deliveries are successful no-ops; active recent claims retry; stale claims can resume.

Processing stages are INSPECTING, PROCESSING_DESKTOP, PROCESSING_MOBILE, GENERATING_POSTER, and READY. Failures store a sanitized category. The worker never returns raw command output or temporary paths to tenants.

Each job uses an isolated `nexora-scroll-*` directory under the system temporary directory. A disk-space preflight runs before download, and cleanup runs after success or failure. The EC2 installer installs and verifies `ffmpeg` and `ffprobe`. Deployment keeps the existing systemd release-and-rollback process.

Required configuration is the existing routed SQS queue, AWS region, Supabase URL, and service role. New Scroll Experience sources and derivatives use private Supabase Storage buckets created by migration. The worker retains S3 compatibility for existing assets and continues sharing the registered job queue with the other worker job types. Never place AWS access keys in the environment file; the instance role is authoritative for legacy S3 access and SQS.

Retry is idempotent and reuses the source asset and derivative keys. Owner-scoped reprocessing can advance `SCROLL_VIDEO_PROCESSING_VERSION` without changing schema.
