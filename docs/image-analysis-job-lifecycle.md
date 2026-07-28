# Image analysis job lifecycle

Each supported Slack image follows:

`queued → processing → completed | needs_review | failed`

`skipped` and `cancelled` are terminal non-analysis states. The worker claims one image-scoped job,
downloads exactly its Slack file, stores the private original, creates an image-linked AI run, and
commits that image's findings. No provider request contains sibling images.

Transient download/provider errors return the SQS message for redelivery. After three receives, the
image is marked failed with a sanitized category. Unsupported or inaccessible files are terminal
immediately. Error categories are safe operational labels; raw provider errors are not shown or
logged. Retrying from the inspection page is admin-only and queues only failed images.

Inspection aggregation runs after claim, completion, failure, and manual retry. PostgreSQL advisory
and row locks serialize aggregation, preventing early finalization and last-writer-wins overwrites.
The operational action inbox deduplicates partial-failure and no-analyzable-image actions by
inspection and action type.

Useful metrics are images discovered, jobs queued, success/partial/full-failure rates, duration,
retry rate, and inspections with no valid confidence. Logs include tenant, inspection, image, and
job identifiers without image URLs, tokens, or provider response bodies.
