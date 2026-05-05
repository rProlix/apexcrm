-- 031_website_assets_bucket.sql
-- Creates the Supabase Storage bucket used by the AI Website Image Builder.
-- Also sets up storage RLS policies so:
--   - Public can READ any object (bucket is public).
--   - Authenticated users (owner/admin/service role) can INSERT, UPDATE, DELETE.
-- The generator uses the service role client which bypasses RLS, so this is
-- belt-and-suspenders for any signed-in user uploads.

-- ─── Create bucket if it does not already exist ────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'website-assets',
  'website-assets',
  true,
  10485760,  -- 10 MB per file
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = true;

-- ─── Storage object RLS policies ──────────────────────────────────────────
-- Storage objects have their own RLS separate from public.* tables.

-- Public read: anyone can view images in this bucket.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'website_assets_public_read'
  ) THEN
    CREATE POLICY "website_assets_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'website-assets');
  END IF;
END;
$$;

-- Authenticated insert: any signed-in user can upload.
-- The generator uses service role which bypasses RLS, but this covers the
-- manual asset upload route used by the builder.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'website_assets_authenticated_insert'
  ) THEN
    CREATE POLICY "website_assets_authenticated_insert"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'website-assets'
        AND auth.role() = 'authenticated'
      );
  END IF;
END;
$$;

-- Authenticated update (upsert uses update path).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'website_assets_authenticated_update'
  ) THEN
    CREATE POLICY "website_assets_authenticated_update"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'website-assets'
        AND auth.role() = 'authenticated'
      );
  END IF;
END;
$$;

-- Authenticated delete.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'website_assets_authenticated_delete'
  ) THEN
    CREATE POLICY "website_assets_authenticated_delete"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'website-assets'
        AND auth.role() = 'authenticated'
      );
  END IF;
END;
$$;
