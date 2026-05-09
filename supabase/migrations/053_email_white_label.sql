-- Migration 053: Email white-label branding columns
-- Adds branding metadata columns to email_logs so each logged email records
-- which brand was used, enabling diagnostics and analytics.

-- ── Add columns if the email_logs table exists ────────────────────────────────

DO $$
BEGIN
  -- branding_mode: 'tenant' | 'platform'
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_logs') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_logs' AND column_name = 'branding_mode') THEN
      ALTER TABLE public.email_logs ADD COLUMN branding_mode text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_logs' AND column_name = 'branding_name') THEN
      ALTER TABLE public.email_logs ADD COLUMN branding_name text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_logs' AND column_name = 'from_name') THEN
      ALTER TABLE public.email_logs ADD COLUMN from_name text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_logs' AND column_name = 'from_email') THEN
      ALTER TABLE public.email_logs ADD COLUMN from_email text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_logs' AND column_name = 'reply_to') THEN
      ALTER TABLE public.email_logs ADD COLUMN reply_to text;
    END IF;

    -- Check constraint for branding_mode values
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_logs_branding_mode_check') THEN
      ALTER TABLE public.email_logs
        ADD CONSTRAINT email_logs_branding_mode_check
        CHECK (branding_mode IS NULL OR branding_mode IN ('tenant', 'platform'));
    END IF;

    -- Index for filtering by branding mode in diagnostics
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'email_logs' AND indexname = 'email_logs_branding_mode_idx') THEN
      CREATE INDEX email_logs_branding_mode_idx ON public.email_logs (branding_mode) WHERE branding_mode IS NOT NULL;
    END IF;

  END IF;
END $$;
