-- 029_update_website_ai_model.sql
-- Updates the Gemini model default from gemini-3.1-pro-preview
-- to gemini-3-flash-preview on the website_ai_import_jobs table.
-- Safe to run multiple times (idempotent).

DO $$
BEGIN
  -- Only run if the table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'website_ai_import_jobs'
  ) THEN
    -- Update the column default
    ALTER TABLE public.website_ai_import_jobs
      ALTER COLUMN model SET DEFAULT 'gemini-3-flash-preview';

    -- Back-fill existing rows that still reference the old model name
    UPDATE public.website_ai_import_jobs
    SET model = 'gemini-3-flash-preview'
    WHERE model IS NULL
       OR model = ''
       OR model = 'gemini-3.1-pro-preview';

  END IF;
END;
$$;
