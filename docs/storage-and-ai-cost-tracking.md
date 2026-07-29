# Storage and AI cost tracking

Usage events are recorded in:

- `storage_usage_events`
- `ai_usage_events`

Storage events include uploads, derivative creation, and duplicate reuse. AI events include cache misses, cache writes, and hits with estimated cost avoided.

The owner-only operations dashboard reads aggregate data through `get_owner_image_operations_summary()` and surfaces storage footprint, duplicate rate, cache hit rate, avoided AI cost, active queue depth, and failed queue count.
