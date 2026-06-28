-- supabase/migrations/084_website_config_store.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Self-contained per-website draft/published content.
--
-- Builder + creative sites keep using site_pages / site_versions. Lightweight
-- sites (a Canva-imported Invitation/Event website) instead store their own
-- draft and published content directly on the websites row, so they are a REAL,
-- separately-publishable record that never overwrites the business builder site.
--
-- Adds a new website source = 'config' for these config-backed sites.
-- Fully additive + idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.websites
  ADD COLUMN IF NOT EXISTS draft_config     jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS published_config jsonb;

-- Allow source = 'config' alongside 'builder' and 'pov_event'.
DO $$ BEGIN
  ALTER TABLE public.websites DROP CONSTRAINT IF EXISTS websites_source_check;
  ALTER TABLE public.websites
    ADD CONSTRAINT websites_source_check CHECK (source IN ('builder','pov_event','config'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'websites_source_check update skipped: %', SQLERRM;
END $$;
