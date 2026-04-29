-- supabase/migrations/022_punch_card_column_fix.sql
--
-- Idempotent guard: ensures `current_punches` exists with the correct name.
--
-- Background: an earlier version of lib/supabase/types.ts referenced the
-- column as `punch_count` instead of `current_punches`, causing TypeScript
-- build failures. The canonical schema (009_rewards.sql) uses `current_punches`
-- throughout. This migration adds the column if somehow absent, and renames
-- `punch_count` if that stale name was ever applied to a live database.

-- 1. If the column is already correctly named, this is a no-op.
ALTER TABLE public.reward_punch_cards
  ADD COLUMN IF NOT EXISTS current_punches integer NOT NULL DEFAULT 0;

-- 2. If a DB was ever created with the wrong name `punch_count`, copy the
--    data across and drop the old column.  The DO block makes both steps
--    conditional so repeated runs are safe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
    AND    table_name   = 'reward_punch_cards'
    AND    column_name  = 'punch_count'
  ) THEN
    -- Copy existing data into the canonical column
    UPDATE public.reward_punch_cards
    SET    current_punches = punch_count
    WHERE  current_punches = 0
    AND    punch_count     > 0;

    -- Drop the stale column
    ALTER TABLE public.reward_punch_cards DROP COLUMN punch_count;
  END IF;
END
$$;

-- 3. Ensure reward_type and reward_value exist (also absent from the old type).
ALTER TABLE public.reward_punch_cards
  ADD COLUMN IF NOT EXISTS reward_type  text    NOT NULL DEFAULT 'free_item',
  ADD COLUMN IF NOT EXISTS reward_value numeric;
