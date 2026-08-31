-- Store new Scroll Experience uploads and derivatives in private Supabase Storage.
-- Existing S3-backed assets remain readable through storage_provider='s3'.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scroll-experience-sources',
  'scroll-experience-sources',
  false,
  10485760,
  ARRAY['video/mp4', 'application/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scroll-experience-media',
  'scroll-experience-media',
  false,
  104857600,
  ARRAY['video/mp4', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.website_scroll_experience_assets
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 's3';

ALTER TABLE public.website_scroll_experience_assets
  DROP CONSTRAINT IF EXISTS website_scroll_assets_storage_provider_check;

ALTER TABLE public.website_scroll_experience_assets
  ADD CONSTRAINT website_scroll_assets_storage_provider_check
  CHECK (storage_provider IN ('s3', 'supabase'));

COMMENT ON COLUMN public.website_scroll_experience_assets.storage_provider IS
  'Storage backend for this immutable asset. New Scroll MP4 assets use Supabase; legacy S3 assets remain supported.';
