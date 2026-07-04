# NexoraNow Van Damage Worker

Standalone Node.js worker for the Van Damage AI Slack → S3 → Gemini pipeline. It is source-only in Phase 2 and is not deployed to EC2 by this change.

## Required environment

`NODE_ENV`, `AWS_REGION`, `VAN_DAMAGE_SQS_QUEUE_URL`, `VAN_DAMAGE_S3_BUCKET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `SLACK_TOKEN_ENCRYPTION_KEY` are required. Never commit their values.

Optional tuning variables are `VAN_DAMAGE_WORKER_CONCURRENCY` (default `3`), `VAN_DAMAGE_VISIBILITY_TIMEOUT_SECONDS` (default `300`), `VAN_DAMAGE_MAX_IMAGE_BYTES` (default `20971520`), `VAN_DAMAGE_MAX_GEMINI_RAW_BYTES` (default `12582912`), and `LOG_LEVEL`.

The EC2 instance should use an IAM role granting receive/delete/change-visibility access to the Van Damage SQS queue, private object access to the configured S3 bucket, and `sts:GetCallerIdentity`. Do not place AWS access keys in this package.

## Local commands

From this directory:

```bash
npm ci
npm run type-check
npm test
npm run build
npm run health
npm run dev
```

The development-only enqueue utility is built as a separate entry point. Run `npx tsx scripts/enqueue-test-job.ts` with real test row IDs. It refuses production use unless `ALLOW_WORKER_TEST_ENQUEUE=true` is explicitly set and never runs automatically.

## Later EC2 deployment

Phase 3 should build an artifact, copy only `dist`, this manifest/lockfile, and production dependencies to EC2, provide environment variables outside Git, and run `node dist/index.js` under a restricted systemd user. The built health command is `node dist/health.js`. Configure restart limits, CloudWatch/journald collection, SQS visibility timeout and DLQ redrive before enabling Slack events. No EC2 deployment is part of Phase 2.

Illustrative Phase 3 unit (do not install it during Phase 2):

```ini
[Unit]
Description=NexoraNow Van Damage Worker
After=network-online.target

[Service]
Type=simple
User=nexoranow-worker
WorkingDirectory=/opt/nexoranow/van-damage-worker
EnvironmentFile=/etc/nexoranow/van-damage-worker.env
ExecStart=/usr/bin/node /opt/nexoranow/van-damage-worker/dist/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```
