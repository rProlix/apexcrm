-- Migration 069: Website Design System
-- Adds design_system column to site_settings for storing the AI-generated
-- brand/design system. Adds design column to site_sections for per-section styling.
-- Idempotent — safe to re-run.

-- ── site_settings: design_system column ─────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'site_settings'
      AND column_name  = 'design_system'
  ) THEN
    ALTER TABLE public.site_settings
      ADD COLUMN design_system jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'site_settings'
      AND column_name  = 'ai_design_generated_at'
  ) THEN
    ALTER TABLE public.site_settings
      ADD COLUMN ai_design_generated_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'site_settings'
      AND column_name  = 'ai_design_source'
  ) THEN
    ALTER TABLE public.site_settings
      ADD COLUMN ai_design_source text;
  END IF;
END $$;

-- ── site_sections: design column ─────────────────────────────────────────────
-- style_config already exists; we ensure it is present and default to '{}'.
-- We do NOT add a separate 'design' column — instead, we store design inside
-- style_config JSONB as style_config.design to match the existing schema.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'site_sections'
      AND column_name  = 'style_config'
  ) THEN
    ALTER TABLE public.site_sections
      ADD COLUMN style_config jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Ensure style_config has a default where null
UPDATE public.site_sections
  SET style_config = '{}'::jsonb
  WHERE style_config IS NULL;

-- ── Indexes ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'site_settings'
      AND indexname  = 'site_settings_ai_design_generated_at_idx'
  ) THEN
    CREATE INDEX site_settings_ai_design_generated_at_idx
      ON public.site_settings (ai_design_generated_at)
      WHERE ai_design_generated_at IS NOT NULL;
  END IF;
END $$;

-- ── Backfill: migrate theme into design_system if theme already has palette ──
-- Only run if design_system is empty but theme has a palette key.
UPDATE public.site_settings
  SET design_system = theme
WHERE
  (design_system IS NULL OR design_system = '{}'::jsonb)
  AND theme IS NOT NULL
  AND theme != '{}'::jsonb
  AND (theme->>'palette') IS NOT NULL;
