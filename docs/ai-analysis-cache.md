# AI analysis cache

AI cache entries are tenant-scoped and keyed from:

- tenant id
- original image SHA-256
- task type and task version
- prompt version
- model capability version
- preprocessing version
- lifecycle/configuration version

This lets exact duplicate evidence reuse a prior private analysis without exposing data across tenants or depending on a provider-specific model name. Cache hits are recorded in `ai_usage_events` with estimated avoided cost.

Changing the prompt, preprocessing, model capability, or lifecycle configuration intentionally creates a new cache namespace.
