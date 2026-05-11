-- =============================================================================
-- 059_fix_aspect_ratios.sql
-- Normalize all existing bad aspect_ratio values in website_image_plans and
-- recreate the CHECK constraint to match the 5 Imagen-supported ratios.
--
-- Safe to run multiple times (idempotent).
--
-- Imagen 4 (imagen-4.0-ultra-generate-001) supports ONLY:
--   '1:1', '9:16', '16:9', '4:3', '3:4'
--
-- This migration:
--   1. Sets column default to '16:9'
--   2. Normalizes all existing rows using a clear mapping
--   3. Drops any existing aspect_ratio check constraint (any name)
--   4. Adds the definitive constraint allowing only the 5 supported values
-- =============================================================================

-- ── 1. Set safe default ───────────────────────────────────────────────────────
ALTER TABLE public.website_image_plans
  ALTER COLUMN aspect_ratio SET DEFAULT '16:9';

-- ── 2. Normalize existing invalid rows ───────────────────────────────────────
UPDATE public.website_image_plans
SET
  -- Preserve the original value before overwriting
  requested_aspect_ratio = COALESCE(requested_aspect_ratio, aspect_ratio),
  aspect_ratio = CASE
    -- Already valid → keep
    WHEN aspect_ratio IN ('1:1', '9:16', '16:9', '4:3', '3:4') THEN aspect_ratio
    -- Numeric unsupported ratios
    WHEN LOWER(aspect_ratio) IN ('3:2', '2:1', '5:3', '7:4', '8:5', '21:9', '16:10')
         THEN '16:9'
    WHEN LOWER(aspect_ratio) IN ('2:3', '1:2', '10:16', '3:5')
         THEN '9:16'
    WHEN LOWER(aspect_ratio) IN ('5:4') THEN '4:3'
    WHEN LOWER(aspect_ratio) IN ('4:5') THEN '3:4'
    -- Text labels that AI planners may output
    WHEN LOWER(aspect_ratio) IN ('landscape','wide','hero','widescreen','cinematic','banner','header','cover')
         THEN '16:9'
    WHEN LOWER(aspect_ratio) IN ('portrait','vertical','mobile_story','story','tall')
         THEN '9:16'
    WHEN LOWER(aspect_ratio) IN ('square','1x1','square_photo','instagram','avatar','icon')
         THEN '1:1'
    WHEN LOWER(aspect_ratio) IN ('card','standard','photo','about','section')
         THEN '4:3'
    WHEN LOWER(aspect_ratio) IN ('tall_portrait','book','pin','pinterest')
         THEN '3:4'
    -- NULL, empty, or completely unknown → safe default
    ELSE '16:9'
  END
WHERE
  aspect_ratio IS NULL
  OR aspect_ratio = ''
  OR aspect_ratio NOT IN ('1:1', '9:16', '16:9', '4:3', '3:4');

-- ── 3. Drop ALL existing aspect_ratio check constraints (any name) ──────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.website_image_plans'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%aspect_ratio%'
  LOOP
    EXECUTE format('ALTER TABLE public.website_image_plans DROP CONSTRAINT IF EXISTS %I', r.conname);
    RAISE NOTICE 'Dropped aspect_ratio constraint: %', r.conname;
  END LOOP;
END;$$;

-- ── 4. Add the definitive constraint ─────────────────────────────────────────
ALTER TABLE public.website_image_plans
  ADD CONSTRAINT website_image_plans_aspect_ratio_check
  CHECK (aspect_ratio IN ('1:1', '9:16', '16:9', '4:3', '3:4'));

-- ── 5. Verify ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM public.website_image_plans
  WHERE aspect_ratio NOT IN ('1:1', '9:16', '16:9', '4:3', '3:4');

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Migration 059 verification failed: % rows still have invalid aspect_ratio', bad_count;
  ELSE
    RAISE NOTICE 'Migration 059: All aspect_ratio values are valid. Constraint applied.';
  END IF;
END;$$;
