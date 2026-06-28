-- supabase/migrations/086_canva_pdf_import.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Canva PDF export → AI-converted NexoraNow Invitation/Event website.
--
-- Adds 'pdf_upload' as an allowed source_type and stores PDF + AI-conversion
-- metadata on website_canva_imports. Fully additive + idempotent; never
-- destroys existing Canva import data.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.website_canva_imports
  ADD COLUMN IF NOT EXISTS pdf_storage_path     text,
  ADD COLUMN IF NOT EXISTS pdf_file_name        text,
  ADD COLUMN IF NOT EXISTS pdf_page_count       integer,
  ADD COLUMN IF NOT EXISTS pdf_analysis         jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_conversion_status text  NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS ai_conversion_summary jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS animation_mapping    jsonb NOT NULL DEFAULT '{}';

-- Extend source_type to allow PDF uploads.
DO $$ BEGIN
  ALTER TABLE public.website_canva_imports DROP CONSTRAINT IF EXISTS website_canva_source_type_check;
  ALTER TABLE public.website_canva_imports
    ADD CONSTRAINT website_canva_source_type_check CHECK (
      source_type IN ('canva_url','embed_code','html_upload','zip_upload','asset_upload','manual','pdf_upload')
    );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'website_canva_source_type_check update skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE public.website_canva_imports DROP CONSTRAINT IF EXISTS website_canva_ai_conversion_status_check;
  ALTER TABLE public.website_canva_imports
    ADD CONSTRAINT website_canva_ai_conversion_status_check CHECK (
      ai_conversion_status IN ('not_started','analyzing','converted','failed')
    );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'website_canva_ai_conversion_status_check skipped: %', SQLERRM;
END $$;
