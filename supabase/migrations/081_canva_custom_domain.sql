-- supabase/migrations/081_canva_custom_domain.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Canva import: support canva.site + user-owned custom domains in Preserve Mode.
-- Fully additive + idempotent. Does not destroy existing data.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.website_canva_imports
  ADD COLUMN IF NOT EXISTS source_domain   text,
  ADD COLUMN IF NOT EXISTS is_custom_domain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_mode text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'website_canva_validation_mode_check') THEN
    ALTER TABLE public.website_canva_imports
      ADD CONSTRAINT website_canva_validation_mode_check
      CHECK (
        validation_mode IS NULL OR validation_mode IN (
          'native_canva_domain', 'canva_site_domain', 'custom_domain', 'embed_code'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS website_canva_source_domain_idx ON public.website_canva_imports(source_domain);
