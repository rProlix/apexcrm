# Storage lifecycle policies

Repository-controlled S3 lifecycle policy lives at:

`infrastructure/van-damage-image-lifecycle/s3-lifecycle-policy.json`

Apply it with:

```bash
VAN_DAMAGE_S3_BUCKET=your-private-bucket AWS_REGION=us-east-1 npm run infra:van-lifecycle
```

The policy transitions original evidence to lower-cost storage over time, transitions derivatives separately, and expires temporary workspace objects. Application-level legal holds and delete eligibility are tracked in Supabase; destructive deletion must remain a separate owner-controlled operation.
