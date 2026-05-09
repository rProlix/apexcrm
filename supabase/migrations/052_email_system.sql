-- supabase/migrations/052_email_system.sql
-- Nexora email system schema: logs, preferences, and invite tracking.
-- All statements are idempotent.

-- ── 1. email_logs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id       uuid,
  customer_id   uuid,
  provider      text        NOT NULL,
  category      text        NOT NULL,
  to_email      text        NOT NULL,
  subject       text        NOT NULL,
  status        text        NOT NULL,
  message_id    text,
  error_message text,
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_logs_provider_check'
  ) THEN
    ALTER TABLE public.email_logs
      ADD CONSTRAINT email_logs_provider_check
        CHECK (provider IN ('resend', 'ses'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_logs_status_check'
  ) THEN
    ALTER TABLE public.email_logs
      ADD CONSTRAINT email_logs_status_check
        CHECK (status IN ('sent', 'failed', 'blocked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_logs_tenant_created_idx   ON public.email_logs (tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_logs_provider_created_idx ON public.email_logs (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS email_logs_status_created_idx   ON public.email_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS email_logs_to_email_idx         ON public.email_logs (to_email, created_at DESC);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_logs' AND policyname='service_role_email_logs'
  ) THEN
    CREATE POLICY "service_role_email_logs" ON public.email_logs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_logs' AND policyname='owner_read_email_logs'
  ) THEN
    CREATE POLICY "owner_read_email_logs" ON public.email_logs
      FOR SELECT
      USING (public.is_platform_owner());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_logs' AND policyname='admin_tenant_email_logs'
  ) THEN
    CREATE POLICY "admin_tenant_email_logs" ON public.email_logs
      FOR SELECT
      USING (
        tenant_id IS NOT NULL
        AND tenant_id = (
          SELECT u.tenant_id FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('admin', 'manager')
            AND u.status = 'active'
          LIMIT 1
        )
      );
  END IF;
END $$;

-- ── 2. email_preferences ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_preferences (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id            uuid        REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id                uuid,
  email                  text        NOT NULL,
  marketing_opt_in       boolean     NOT NULL DEFAULT false,
  transactional_opt_in   boolean     NOT NULL DEFAULT true,
  appointment_reminders  boolean     NOT NULL DEFAULT true,
  reward_notifications   boolean     NOT NULL DEFAULT true,
  unsubscribed_at        timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_prefs_tenant_email_idx   ON public.email_preferences (tenant_id, lower(email));
CREATE INDEX IF NOT EXISTS email_prefs_customer_idx       ON public.email_preferences (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_prefs_user_idx           ON public.email_preferences (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_preferences' AND policyname='service_role_email_prefs'
  ) THEN
    CREATE POLICY "service_role_email_prefs" ON public.email_preferences
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_preferences' AND policyname='owner_admin_email_prefs'
  ) THEN
    CREATE POLICY "owner_admin_email_prefs" ON public.email_preferences
      FOR SELECT
      USING (
        tenant_id = (
          SELECT u.tenant_id FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('owner', 'admin', 'manager')
            AND u.status = 'active'
          LIMIT 1
        )
        OR public.is_platform_owner()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_preferences' AND policyname='customer_own_email_prefs'
  ) THEN
    CREATE POLICY "customer_own_email_prefs" ON public.email_preferences
      FOR ALL
      USING (
        customer_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.customer_accounts ca
          WHERE ca.auth_user_id = auth.uid()
            AND ca.customer_id  = email_preferences.customer_id
        )
      )
      WITH CHECK (
        customer_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.customer_accounts ca
          WHERE ca.auth_user_id = auth.uid()
            AND ca.customer_id  = email_preferences.customer_id
        )
      );
  END IF;
END $$;

-- ── 3. email_invites (only if customer_invites table not already used) ────────
-- The app already has public.customer_invites for customer invitations.
-- This table handles business/staff invite tokens separately.

CREATE TABLE IF NOT EXISTS public.email_invites (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
  invited_email text        NOT NULL,
  invited_name  text,
  invite_type   text        NOT NULL DEFAULT 'staff',
  role          text,
  token_hash    text        NOT NULL UNIQUE,
  status        text        NOT NULL DEFAULT 'pending',
  invited_by    uuid,
  expires_at    timestamptz,
  accepted_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_invites_type_check'
  ) THEN
    ALTER TABLE public.email_invites
      ADD CONSTRAINT email_invites_type_check
        CHECK (invite_type IN ('customer', 'business', 'staff', 'admin', 'owner'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_invites_status_check'
  ) THEN
    ALTER TABLE public.email_invites
      ADD CONSTRAINT email_invites_status_check
        CHECK (status IN ('pending', 'sent', 'accepted', 'expired', 'revoked', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_invites_tenant_email_idx ON public.email_invites (tenant_id, lower(invited_email)) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_invites_status_exp_idx   ON public.email_invites (status, expires_at);

ALTER TABLE public.email_invites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_invites' AND policyname='service_role_email_invites'
  ) THEN
    CREATE POLICY "service_role_email_invites" ON public.email_invites
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='email_invites' AND policyname='owner_admin_email_invites'
  ) THEN
    CREATE POLICY "owner_admin_email_invites" ON public.email_invites
      FOR ALL
      USING (
        public.is_platform_owner()
        OR tenant_id = (
          SELECT u.tenant_id FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('admin', 'manager')
            AND u.status = 'active'
          LIMIT 1
        )
      )
      WITH CHECK (
        public.is_platform_owner()
        OR tenant_id = (
          SELECT u.tenant_id FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('admin', 'manager')
            AND u.status = 'active'
          LIMIT 1
        )
      );
  END IF;
END $$;
