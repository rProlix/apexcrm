-- supabase/migrations/087_fix_canva_pdf_import_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- fix_canva_pdf_import_schema
--
-- Repairs environments where the Canva PDF import code shipped ahead of the
-- database (PostgREST error: "Could not find the 'ai_conversion_status' column
-- of 'website_canva_imports' in the schema cache").
--
-- Fully additive + idempotent. Safe to run even if 085/086 already applied.
-- Adds every column the PDF + embed import code depends on, fixes the
-- source_type / ai_conversion_status / embed_status check constraints, and
-- forces a PostgREST schema-cache reload so the new columns are visible
-- immediately without a manual restart.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Columns ──────────────────────────────────────────────────────────────────
ALTER TABLE public.website_canva_imports
  ADD COLUMN IF NOT EXISTS pdf_storage_path      text,
  ADD COLUMN IF NOT EXISTS pdf_file_name         text,
  ADD COLUMN IF NOT EXISTS pdf_page_count        integer,
  ADD COLUMN IF NOT EXISTS pdf_analysis          jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_conversion_status  text    NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS ai_conversion_summary jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS animation_mapping     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS iframe_src            text,
  ADD COLUMN IF NOT EXISTS source_domain         text,
  ADD COLUMN IF NOT EXISTS is_custom_domain      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_mode       text,
  ADD COLUMN IF NOT EXISTS embed_status          text    NOT NULL DEFAULT 'untested',
  ADD COLUMN IF NOT EXISTS embed_warnings        jsonb   NOT NULL DEFAULT '[]'::jsonb;

-- ── source_type: allow pdf_upload (drop only the specific constraint, recreate) ─
DO $$ BEGIN
  ALTER TABLE public.website_canva_imports DROP CONSTRAINT IF EXISTS website_canva_source_type_check;
  ALTER TABLE public.website_canva_imports
    ADD CONSTRAINT website_canva_source_type_check CHECK (
      source_type IN ('canva_url','embed_code','html_upload','zip_upload','asset_upload','manual','pdf_upload')
    );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'website_canva_source_type_check update skipped: %', SQLERRM;
END $$;

-- ── ai_conversion_status allowed values ──────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.website_canva_imports DROP CONSTRAINT IF EXISTS website_canva_ai_conversion_status_check;
  ALTER TABLE public.website_canva_imports
    ADD CONSTRAINT website_canva_ai_conversion_status_check CHECK (
      ai_conversion_status IN ('not_started','analyzing','converted','failed')
    );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'website_canva_ai_conversion_status_check skipped: %', SQLERRM;
END $$;

-- ── embed_status allowed values ──────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.website_canva_imports DROP CONSTRAINT IF EXISTS website_canva_embed_status_check;
  ALTER TABLE public.website_canva_imports
    ADD CONSTRAINT website_canva_embed_status_check CHECK (
      embed_status IN ('untested','can_attempt_iframe','loaded_in_preview','fallback_required','blocked_or_failed')
    );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'website_canva_embed_status_check skipped: %', SQLERRM;
END $$;

-- ── Force PostgREST to reload its schema cache so new columns are visible ─────
NOTIFY pgrst, 'reload schema';
