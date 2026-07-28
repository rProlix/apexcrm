# Multi-image inspection processing

## Root cause and architecture

Slack ingestion already enumerated and persisted every supported attachment, but it created one
inspection-wide queue job. The worker downloaded all files into one provider request, and the
completion RPC deleted every inspection finding before replacing the result. A failed sibling
therefore failed the batch, concurrent completions could overwrite each other, and permanent
failures wrote a synthetic 0% confidence.

Ingestion now creates one durable image record, analysis record, and queue job per supported Slack
file. The image-scoped idempotency key is:

`tenant_id:image_id:analysis_version`

The event route queues jobs in bounded groups of four. Replayed Slack events reuse the same image
and job identities. SQS may still deliver duplicates; the claim RPC makes completed deliveries
successful no-ops and uses a stale-processing threshold for safe redelivery.

## Privacy and isolation

Every database operation verifies tenant, business, inspection, and image scope. The analysis table
has RLS, authenticated users receive read access through tenant membership, and writes are reserved
for the service role. Slack private URLs never become public URLs; the UI continues to use the
signed-image endpoint and its bounded cache.

## Damage evidence

Each finding is written with its source `image_id`. Completing an image deletes and replaces only
that image's automated findings. The damage map aggregates valid findings across the inspection,
while the selected-photo overlay uses only findings linked to that photo.

Known limitation: pre-migration batch runs cannot always be divided into trustworthy per-image
results. Recovery preserves those findings and queues only images without a valid image analysis.
