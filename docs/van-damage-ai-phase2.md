# Van Damage AI — Phase 2 operations

Phase 2 adds the production code and database foundation but does not deploy the worker to EC2.

## Vercel environment

Configure `AWS_REGION=us-east-2`, `VAN_DAMAGE_SQS_QUEUE_URL=https://sqs.us-east-2.amazonaws.com/696800758882/nexoranow-van-damage-jobs`, `VAN_DAMAGE_S3_BUCKET=nexoranow-van-images-prod`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_TOKEN_ENCRYPTION_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and `GEMINI_MODEL=gemini-2.5-flash`. Existing `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` remain required by ApexCRM. All Slack, Gemini, AWS, and service-role values are server-only.

The encryption key must be exactly 32 UTF-8 bytes or a base64 string decoding to exactly 32 bytes. Vercel may use `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optional `AWS_SESSION_TOKEN` when no workload identity provider is available. Never commit any value.

## Slack setup and OAuth test

1. Apply `20260703000000_van_damage_ai_phase2.sql` and `20260704000000_van_damage_worker_supabase_compat.sql` to the same Supabase project used by Vercel. The compatibility migration adds explicit Data API grants and the scoped worker contract RPC.
2. Configure Slack's OAuth redirect as `https://<app-domain>/api/integrations/slack/oauth/callback`.
3. Configure the Events API request URL as `https://<app-domain>/api/integrations/slack/events` and subscribe to `message.channels` and `message.groups`.
4. Enable the `damage_ai` tenant module, open `/dashboard/damage-ai/settings/slack`, connect Slack, and run **Test**.
5. Invite the bot to the intended channels, select those channels in settings, and save. No channel is enabled implicitly.

## Event and queue tests

Slack's URL-verification request verifies the signing secret before returning its challenge. Post a supported image in a selected channel and confirm one row each in the Slack event, inspection, job, and image tables. Re-deliver the same `event_id` and confirm no duplicate inspection or image rows are created.

Use the worker's guarded `scripts/enqueue-test-job.ts` only with real test row IDs and never as an automatic production action. SQS messages contain database/Slack identifiers only, not credentials or private Slack URLs.

## Local verification

```bash
npm run test:van-damage
npm run type-check
npm run build
npm --prefix workers/van-damage-worker run type-check
npm --prefix workers/van-damage-worker test
npm run worker:van:build
```

See `workers/van-damage-worker/README.md` for worker health and later EC2/systemd guidance.
