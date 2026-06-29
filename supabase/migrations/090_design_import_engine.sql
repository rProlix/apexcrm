-- supabase/migrations/090_design_import_engine.sql
-- Universal AI Design Import Engine diagnostics column on website_canva_imports.

ALTER TABLE public.website_canva_imports
  ADD COLUMN IF NOT EXISTS design_import_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
