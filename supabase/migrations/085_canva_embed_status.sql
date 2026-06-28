-- supabase/migrations/085_canva_embed_status.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Persist resolved Canva embed info so the public renderer knows the exact,
-- framing-ready iframe src and embed diagnostics without re-parsing each load.
-- Fully additive + idempotent. We never store raw unsafe embed HTML.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.website_canva_imports
  ADD COLUMN IF NOT EXISTS iframe_src     text,
  ADD COLUMN IF NOT EXISTS embed_status   text NOT NULL DEFAULT 'untested',
  ADD COLUMN IF NOT EXISTS embed_warnings jsonb NOT NULL DEFAULT '[]';

-- source_domain, is_custom_domain, validation_mode already exist from 080/081,
-- but add them defensively in case an environment is on an older baseline.
ALTER TABLE public.website_canva_imports
  ADD COLUMN IF NOT EXISTS source_domain   text,
  ADD COLUMN IF NOT EXISTS is_custom_domain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_mode text;

DO $$ BEGIN
  ALTER TABLE public.website_canva_imports DROP CONSTRAINT IF EXISTS website_canva_embed_status_check;
  ALTER TABLE public.website_canva_imports
    ADD CONSTRAINT website_canva_embed_status_check CHECK (
      embed_status IN ('untested','can_attempt_iframe','loaded_in_preview','fallback_required','blocked_or_failed')
    );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'website_canva_embed_status_check skipped: %', SQLERRM;
END $$;
