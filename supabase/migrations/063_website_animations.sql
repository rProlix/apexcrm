-- =============================================================================
-- 063_website_animations.sql
-- AI-powered Premium Animation & Luxury UI Designer for Website Builder.
-- Idempotent — safe to run multiple times.
--
-- Creates:
--   public.website_animation_plans        — AI animation design plans
--
-- Extends (idempotently):
--   public.site_sections                  — animation_config, style_config
--   public.site_pages                     — animation_config, style_config
--   public.tenants                        — website_animation_config
-- =============================================================================

-- =============================================================================
-- 1. Extend site_sections with animation/style config columns
-- =============================================================================
ALTER TABLE public.site_sections
  ADD COLUMN IF NOT EXISTS animation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS style_config     jsonb NOT NULL DEFAULT '{}'::jsonb;

-- =============================================================================
-- 2. Extend site_pages with animation/style config columns
-- =============================================================================
ALTER TABLE public.site_pages
  ADD COLUMN IF NOT EXISTS animation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS style_config     jsonb NOT NULL DEFAULT '{}'::jsonb;

-- =============================================================================
-- 3. Extend tenants with global website animation config
-- =============================================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS website_animation_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- =============================================================================
-- 4. Create website_animation_plans table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.website_animation_plans (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_page_id        uuid        NULL REFERENCES public.site_pages(id) ON DELETE CASCADE,
  site_section_id     uuid        NULL REFERENCES public.site_sections(id) ON DELETE CASCADE,
  created_by          uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Lifecycle
  status              text        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','planned','applied','disabled','failed','archived')),
  scope               text        NOT NULL DEFAULT 'section'
    CHECK (scope IN ('global','page','section')),

  -- Inputs
  prompt_input        text        NULL,
  desired_vibe        text        NULL,
  intensity           text        NULL
    CHECK (intensity IS NULL OR intensity IN ('subtle','balanced','cinematic')),
  performance_mode    text        NULL
    CHECK (performance_mode IS NULL OR performance_mode IN ('fast','balanced','premium')),
  include_mobile_animations boolean NOT NULL DEFAULT true,

  -- AI output
  business_context    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ai_plan             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  animation_config    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  style_config        jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Error tracking
  error_message       text        NULL,

  -- Timestamps
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  applied_at          timestamptz NULL,
  disabled_at         timestamptz NULL
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS wap_tenant_idx        ON public.website_animation_plans (tenant_id);
CREATE INDEX IF NOT EXISTS wap_tenant_status_idx ON public.website_animation_plans (tenant_id, status);
CREATE INDEX IF NOT EXISTS wap_tenant_scope_idx  ON public.website_animation_plans (tenant_id, scope);
CREATE INDEX IF NOT EXISTS wap_page_idx          ON public.website_animation_plans (site_page_id);
CREATE INDEX IF NOT EXISTS wap_section_idx       ON public.website_animation_plans (site_section_id);

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'wap_updated_at'
      AND tgrelid = 'public.website_animation_plans'::regclass
  ) THEN
    CREATE TRIGGER wap_updated_at
      BEFORE UPDATE ON public.website_animation_plans
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- =============================================================================
-- 5. Row-Level Security
-- =============================================================================
ALTER TABLE public.website_animation_plans ENABLE ROW LEVEL SECURITY;

-- Service role: full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'website_animation_plans' AND policyname = 'wap_service_role_all'
  ) THEN
    CREATE POLICY "wap_service_role_all"
      ON public.website_animation_plans
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Owner/admin: read and write their own tenant's plans
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'website_animation_plans' AND policyname = 'wap_owner_admin_all'
  ) THEN
    CREATE POLICY "wap_owner_admin_all"
      ON public.website_animation_plans
      FOR ALL
      TO authenticated
      USING (
        tenant_id IN (
          SELECT tenant_id FROM public.users
          WHERE auth_user_id = auth.uid()
            AND role IN ('owner', 'admin')
            AND status = 'active'
        )
      )
      WITH CHECK (
        tenant_id IN (
          SELECT tenant_id FROM public.users
          WHERE auth_user_id = auth.uid()
            AND role IN ('owner', 'admin')
            AND status = 'active'
        )
      );
  END IF;
END $$;

-- Public/anon: no access (animation configs served server-side through trusted queries)
-- (no policy created — default deny for anon/public)

DO $$ BEGIN
  RAISE NOTICE 'Migration 063: website_animation_plans created. site_sections, site_pages, tenants extended.';
END $$;
