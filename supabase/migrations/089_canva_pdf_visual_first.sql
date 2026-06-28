-- supabase/migrations/089_canva_pdf_visual_first.sql
-- Idempotent repair: ensure visual-first PDF import columns exist.

ALTER TABLE public.website_canva_imports
  ADD COLUMN IF NOT EXISTS rendered_pages       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS visual_extraction    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extracted_graphics   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS link_mapping         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rsvp_mapping         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS interactive_overlays jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
