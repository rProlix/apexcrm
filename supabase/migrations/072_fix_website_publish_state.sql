-- 072_fix_website_publish_state.sql
--
-- Adds publish-tracking columns to site_settings that were missing from the
-- original schema, causing the publish pipeline to lose state between requests.
--
-- Safe to run multiple times (IF NOT EXISTS guards on all DDL).

-- ── site_settings publish tracking ───────────────────────────────────────────

-- When was this site last successfully published?
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL;

-- Which site_versions row was created on last publish?
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS last_published_version_id uuid NULL
  REFERENCES public.site_versions(id) ON DELETE SET NULL;

-- Has the site been edited since last publish?
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS has_unpublished_changes boolean NOT NULL DEFAULT false;

-- Backfill: sites that are already published but have no published_at
UPDATE public.site_settings
SET published_at = updated_at
WHERE is_published = true
  AND published_at IS NULL
  AND updated_at IS NOT NULL;

-- ── site_settings: ensure design columns exist ────────────────────────────────
-- Migration 069 added design_system but guard idempotently here too.

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS design_system jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── has_unpublished_changes trigger ──────────────────────────────────────────
-- Automatically set has_unpublished_changes = true whenever a section or
-- page is mutated, so the builder UI can show a "Draft has unsaved changes" badge.
-- We use a lightweight function + triggers on site_sections and site_pages.

CREATE OR REPLACE FUNCTION public.mark_site_unpublished()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.site_settings
  SET has_unpublished_changes = true,
      updated_at = now()
  WHERE tenant_id = NEW.tenant_id
    AND is_published = true;
  RETURN NEW;
END;
$$;

-- site_sections trigger
DROP TRIGGER IF EXISTS trg_section_marks_unpublished ON public.site_sections;
CREATE TRIGGER trg_section_marks_unpublished
  AFTER INSERT OR UPDATE ON public.site_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_site_unpublished();

-- site_pages trigger
DROP TRIGGER IF EXISTS trg_page_marks_unpublished ON public.site_pages;
CREATE TRIGGER trg_page_marks_unpublished
  AFTER INSERT OR UPDATE ON public.site_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_site_unpublished();

-- ── Index for dashboard queries ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_site_settings_published_at
  ON public.site_settings (tenant_id, published_at DESC NULLS LAST)
  WHERE is_published = true;

-- Grant (already granted in earlier migrations, but safe to repeat)
GRANT SELECT, UPDATE ON public.site_settings TO authenticated;
GRANT SELECT ON public.site_settings TO anon;
