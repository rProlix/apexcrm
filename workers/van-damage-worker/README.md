# NexoraNow Van Damage Worker

Standalone Node.js worker for the Van Damage AI Slack → S3 → Gemini pipeline. Phase 3B runs this package continuously on EC2 under systemd; Slack events and SQS enqueueing remain on Vercel.

## Required environment

`NODE_ENV`, `AWS_REGION`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SLACK_TOKEN_ENCRYPTION_KEY` are required. Queue, bucket, and Gemini credentials accept the production names `SQS_QUEUE_URL`, `S3_BUCKET`, and `GOOGLE_GEMINI_API_KEY`; the original `VAN_DAMAGE_SQS_QUEUE_URL`, `VAN_DAMAGE_S3_BUCKET`, and `GEMINI_API_KEY` names remain supported for backward compatibility. Never commit real values.

Optional tuning variables are `VAN_DAMAGE_WORKER_CONCURRENCY` (default `3`), `VAN_DAMAGE_VISIBILITY_TIMEOUT_SECONDS` (default `300`), `VAN_DAMAGE_MAX_IMAGE_BYTES` (default `20971520`), `VAN_DAMAGE_MAX_GEMINI_RAW_BYTES` (default `12582912`), and `LOG_LEVEL`.

Apply both Van Damage migrations before starting the worker. `npm run health` verifies the exact Supabase table/RPC contract (`2026-07-04-v1`) in addition to AWS, S3, SQS, encryption, and Gemini configuration.

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

## EC2 deployment

From a complete repository checkout on the EC2 host:

```bash
sudo deploy/ec2/install-worker.sh
sudoedit /etc/nexoranow/van-damage-worker.env
sudo deploy/ec2/deploy-worker.sh
```

The installer provisions Node LTS, Git, AWS CLI, the `nexoranow` system account, directories, environment file, and systemd unit. The deployment script stops the service, backs up the current release, builds in isolation, installs production dependencies, verifies both built entrypoints, swaps releases, starts and enables the service, and restores the previous release if deployment fails.

Run the detailed health report with the service environment loaded:

```bash
sudo -u nexoranow bash -c 'set -a; source /etc/nexoranow/van-damage-worker.env; cd /opt/nexoranow/van-damage-worker; exec /usr/bin/node dist/health.js'
```

It returns `Healthy`, `Warning`, or `Unhealthy` and verifies Supabase, SQS, S3, Gemini initialization, and Slack client initialization. Worker logs are structured JSON in journald:

```bash
journalctl -u van-damage-worker.service -f
```
