-- 055_fix_website_image_plans_created_by.sql
-- Fixes the FK violation on website_image_plans.created_by.
--
-- Root cause:
--   The app code was passing public.users.id (internal row UUID) into created_by,
--   but the column is declared as REFERENCES auth.users(id). These are different
--   UUIDs — public.users.id is a surrogate PK in the app table, while auth.users.id
--   is the Supabase Auth identity UUID. The fix is:
--     1. Null out any existing rows whose created_by doesn't exist in auth.users.
--     2. Drop and recreate the FK with ON DELETE SET NULL so future row deletions
--        from auth.users never cascade-break image plans.
--     3. The app code is updated to use ctx.auth_id (= auth.users.id) everywhere.
--
-- Idempotent: all operations use IF EXISTS / IF NOT EXISTS / DO blocks.

-- ─── 1. Make sure created_by is nullable ──────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'website_image_plans'
      AND column_name  = 'created_by'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.website_image_plans ALTER COLUMN created_by DROP NOT NULL;
    RAISE NOTICE 'Made website_image_plans.created_by nullable.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'website_image_jobs'
      AND column_name  = 'created_by'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.website_image_jobs ALTER COLUMN created_by DROP NOT NULL;
    RAISE NOTICE 'Made website_image_jobs.created_by nullable.';
  END IF;
END;
$$;

-- ─── 2. Null out rows whose created_by does not exist in auth.users ───────────
-- (This fixes any rows inserted with the wrong public.users.id UUID.)
DO $$
DECLARE
  nulled_plans integer;
  nulled_jobs  integer;
BEGIN
  -- Plans
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'website_image_plans'
  ) THEN
    UPDATE public.website_image_plans wip
    SET created_by = NULL
    WHERE created_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = wip.created_by);
    GET DIAGNOSTICS nulled_plans = ROW_COUNT;
    RAISE NOTICE 'Nulled % invalid created_by rows in website_image_plans.', nulled_plans;
  END IF;

  -- Jobs
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'website_image_jobs'
  ) THEN
    UPDATE public.website_image_jobs wij
    SET created_by = NULL
    WHERE created_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = wij.created_by);
    GET DIAGNOSTICS nulled_jobs = ROW_COUNT;
    RAISE NOTICE 'Nulled % invalid created_by rows in website_image_jobs.', nulled_jobs;
  END IF;
END;
$$;

-- ─── 3. Drop and recreate the FK on website_image_plans ──────────────────────
DO $$
BEGIN
  -- Drop every existing created_by constraint (old or renamed)
  DECLARE
    r record;
  BEGIN
    FOR r IN (
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.website_image_plans'::regclass
        AND contype  = 'f'
        AND conname  ILIKE '%created_by%'
    ) LOOP
      EXECUTE format('ALTER TABLE public.website_image_plans DROP CONSTRAINT %I', r.conname);
      RAISE NOTICE 'Dropped constraint % from website_image_plans.', r.conname;
    END LOOP;
  END;
END;
$$;

ALTER TABLE public.website_image_plans
  ADD CONSTRAINT website_image_plans_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ─── 4. Drop and recreate the FK on website_image_jobs ───────────────────────
DO $$
BEGIN
  DECLARE
    r record;
  BEGIN
    FOR r IN (
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.website_image_jobs'::regclass
        AND contype  = 'f'
        AND conname  ILIKE '%created_by%'
    ) LOOP
      EXECUTE format('ALTER TABLE public.website_image_jobs DROP CONSTRAINT %I', r.conname);
      RAISE NOTICE 'Dropped constraint % from website_image_jobs.', r.conname;
    END LOOP;
  END;
END;
$$;

ALTER TABLE public.website_image_jobs
  ADD CONSTRAINT website_image_jobs_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ─── 5. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS website_image_plans_created_by_idx
  ON public.website_image_plans(created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS website_image_jobs_created_by_idx
  ON public.website_image_jobs(created_by)
  WHERE created_by IS NOT NULL;
