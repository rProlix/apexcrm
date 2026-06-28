-- supabase/migrations/079_pov_invitation_camera.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Extends the POV Event App (078) so Invitation / Event websites can OPTIONALLY
-- enable the POV Event Camera, and so guests have explicit register/login
-- controls.
--
-- Fully additive + idempotent. Does NOT touch existing data.
--
--   1. pov_events: allow_guest_login + allow_guest_registration toggles.
--   2. site_settings: pov_enabled + pov_event_id so a normal (invitational)
--      site can carry an optional linked POV event.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── pov_events: guest register/login toggles ────────────────────────────────
ALTER TABLE public.pov_events
  ADD COLUMN IF NOT EXISTS allow_guest_login        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_guest_registration boolean NOT NULL DEFAULT true;

-- ── site_settings: optional POV camera on any site (esp. invitational) ───────
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS pov_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pov_event_id uuid;

-- Soft FK: keep NULL when an event is removed instead of cascading the site away.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_pov_event_fk'
  ) THEN
    ALTER TABLE public.site_settings
      ADD CONSTRAINT site_settings_pov_event_fk
      FOREIGN KEY (pov_event_id) REFERENCES public.pov_events(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS site_settings_pov_event_idx ON public.site_settings(pov_event_id);
