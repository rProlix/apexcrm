-- supabase/migrations/078_pov_event_app.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- POV Event App — a private, disposable-camera-style event app inside the
-- NexoraNow / ApexCRM Website Builder.
--
-- This migration is ADDITIVE and idempotent. It does NOT alter or drop any
-- existing website-builder data.
--
--   1. Adds site_settings.website_type so the builder can branch on app type
--      (business | creative | invitational | pov_event).
--   2. Creates pov_events, pov_guests, pov_media, pov_guest_sessions.
--   3. Enables RLS with the same service-role + owner/admin pattern used by
--      007_website_builder.sql. Public guests never touch these tables
--      directly — all guest access goes through service-role API routes that
--      enforce a lightweight cookie session in code.
--   4. Creates the public `event-media` storage bucket + policies.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — Website / App type on the existing site_settings table
-- ═══════════════════════════════════════════════════════════════════════════
-- site_settings already holds one row per tenant (the tenant's site config).
-- We extend it rather than create a parallel table.

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS website_type text NOT NULL DEFAULT 'business';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_website_type_check'
  ) THEN
    ALTER TABLE public.site_settings
      ADD CONSTRAINT site_settings_website_type_check
      CHECK (website_type IN ('business','creative','invitational','pov_event'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS site_settings_website_type_idx
  ON public.site_settings(website_type);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — pov_events
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pov_events (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id              uuid,
  website_id               uuid,
  name                     text        NOT NULL,
  slug                     text        NOT NULL,
  event_type               text,
  event_date               date,
  event_start_at           timestamptz,
  event_end_at             timestamptz,
  gallery_reveal_at        timestamptz NOT NULL,
  timezone                 text        NOT NULL DEFAULT 'America/Los_Angeles',
  is_active                boolean     NOT NULL DEFAULT true,
  allow_photos             boolean     NOT NULL DEFAULT true,
  allow_videos             boolean     NOT NULL DEFAULT true,
  allow_audio              boolean     NOT NULL DEFAULT true,
  video_max_seconds        integer     NOT NULL DEFAULT 15,
  audio_max_seconds        integer     NOT NULL DEFAULT 30,
  require_pin              boolean     NOT NULL DEFAULT true,
  gallery_locked_message   text        NOT NULL DEFAULT 'Gallery unlocks tomorrow. Come back soon to relive the moment.',
  gallery_unlocked_message text        NOT NULL DEFAULT 'The gallery is now open.',
  theme                    jsonb       NOT NULL DEFAULT '{}',
  settings                 jsonb       NOT NULL DEFAULT '{}',
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Tenant-scoped unique slug.
CREATE UNIQUE INDEX IF NOT EXISTS pov_events_tenant_slug_idx
  ON public.pov_events(tenant_id, slug);

-- Public routing resolves an event by slug globally. Slugs are generated with a
-- random suffix so this is unique in practice; the index speeds up lookups.
CREATE INDEX IF NOT EXISTS pov_events_slug_idx       ON public.pov_events(slug);
CREATE INDEX IF NOT EXISTS pov_events_tenant_idx     ON public.pov_events(tenant_id);
CREATE INDEX IF NOT EXISTS pov_events_website_idx    ON public.pov_events(website_id);
CREATE INDEX IF NOT EXISTS pov_events_reveal_idx     ON public.pov_events(gallery_reveal_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — pov_guests
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pov_guests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  event_id         uuid        NOT NULL REFERENCES public.pov_events(id) ON DELETE CASCADE,
  phone_number     text        NOT NULL,
  phone_normalized text        NOT NULL,
  display_name     text,
  pin_hash         text        NOT NULL,
  pin_salt         text,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pov_guests_event_phone_idx
  ON public.pov_guests(event_id, phone_normalized);
CREATE INDEX IF NOT EXISTS pov_guests_tenant_idx ON public.pov_guests(tenant_id);
CREATE INDEX IF NOT EXISTS pov_guests_event_idx  ON public.pov_guests(event_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — pov_media
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pov_media (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  event_id         uuid        NOT NULL REFERENCES public.pov_events(id) ON DELETE CASCADE,
  guest_id         uuid        REFERENCES public.pov_guests(id) ON DELETE SET NULL,
  media_type       text        NOT NULL,
  storage_provider text,
  bucket           text,
  storage_path     text        NOT NULL,
  public_url       text,
  thumbnail_url    text,
  mime_type        text,
  file_size_bytes  bigint,
  duration_seconds numeric,
  width            integer,
  height           integer,
  caption          text,
  status           text        NOT NULL DEFAULT 'approved',
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pov_media_media_type_check CHECK (media_type IN ('photo','video','audio')),
  CONSTRAINT pov_media_status_check     CHECK (status IN ('pending','approved','hidden','reported','deleted'))
);

CREATE INDEX IF NOT EXISTS pov_media_tenant_idx     ON public.pov_media(tenant_id);
CREATE INDEX IF NOT EXISTS pov_media_event_idx      ON public.pov_media(event_id);
CREATE INDEX IF NOT EXISTS pov_media_guest_idx      ON public.pov_media(guest_id);
CREATE INDEX IF NOT EXISTS pov_media_type_idx       ON public.pov_media(media_type);
CREATE INDEX IF NOT EXISTS pov_media_status_idx     ON public.pov_media(status);
CREATE INDEX IF NOT EXISTS pov_media_created_at_idx ON public.pov_media(created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — pov_guest_sessions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pov_guest_sessions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL,
  event_id           uuid        NOT NULL REFERENCES public.pov_events(id) ON DELETE CASCADE,
  guest_id           uuid        NOT NULL REFERENCES public.pov_guests(id) ON DELETE CASCADE,
  session_token_hash text        NOT NULL,
  expires_at         timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pov_guest_sessions_token_idx
  ON public.pov_guest_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS pov_guest_sessions_event_idx ON public.pov_guest_sessions(event_id);
CREATE INDEX IF NOT EXISTS pov_guest_sessions_guest_idx ON public.pov_guest_sessions(guest_id);
CREATE INDEX IF NOT EXISTS pov_guest_sessions_expiry_idx ON public.pov_guest_sessions(expires_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6 — updated_at triggers (touch_updated_at created in 007)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pov_events_updated_at') THEN
    CREATE TRIGGER pov_events_updated_at BEFORE UPDATE ON public.pov_events
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pov_guests_updated_at') THEN
    CREATE TRIGGER pov_guests_updated_at BEFORE UPDATE ON public.pov_guests
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pov_media_updated_at') THEN
    CREATE TRIGGER pov_media_updated_at BEFORE UPDATE ON public.pov_media
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 7 — Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.pov_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pov_guests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pov_media          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pov_guest_sessions ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS (matches 007_website_builder.sql). Public guest
-- access is mediated exclusively by service-role API routes that verify a
-- signed httpOnly cookie session in application code.
DROP POLICY IF EXISTS service_role_all ON public.pov_events;
DROP POLICY IF EXISTS service_role_all ON public.pov_guests;
DROP POLICY IF EXISTS service_role_all ON public.pov_media;
DROP POLICY IF EXISTS service_role_all ON public.pov_guest_sessions;

CREATE POLICY service_role_all ON public.pov_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON public.pov_guests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON public.pov_media
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON public.pov_guest_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── pov_events: owner + tenant admin/staff manage their own events ────────────
DROP POLICY IF EXISTS pov_events_owner ON public.pov_events;
CREATE POLICY pov_events_owner ON public.pov_events
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

DROP POLICY IF EXISTS pov_events_admin ON public.pov_events;
CREATE POLICY pov_events_admin ON public.pov_events
  FOR ALL TO authenticated
  USING  (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  WITH CHECK (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'));

-- ── pov_guests ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS pov_guests_owner ON public.pov_guests;
CREATE POLICY pov_guests_owner ON public.pov_guests
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

DROP POLICY IF EXISTS pov_guests_admin ON public.pov_guests;
CREATE POLICY pov_guests_admin ON public.pov_guests
  FOR ALL TO authenticated
  USING  (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  WITH CHECK (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'));

-- ── pov_media ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS pov_media_owner ON public.pov_media;
CREATE POLICY pov_media_owner ON public.pov_media
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

DROP POLICY IF EXISTS pov_media_admin ON public.pov_media;
CREATE POLICY pov_media_admin ON public.pov_media
  FOR ALL TO authenticated
  USING  (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  WITH CHECK (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'));

-- ── pov_guest_sessions: owner/admin read for diagnostics only ────────────────
DROP POLICY IF EXISTS pov_guest_sessions_admin ON public.pov_guest_sessions;
CREATE POLICY pov_guest_sessions_admin ON public.pov_guest_sessions
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'owner'
    OR (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 8 — event-media storage bucket
-- ═══════════════════════════════════════════════════════════════════════════
-- Public bucket so the revealed gallery can play photos / 15s clips / 30s audio
-- directly. Reveal-gating is enforced at the API layer: media URLs are never
-- returned to guests before gallery_reveal_at. Storage paths embed event_id and
-- guest_id UUIDs + timestamps, so they are not enumerable.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-media', 'event-media', true, 73400320,    -- 70 MB ceiling (short clips)
  ARRAY[
    'image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif',
    'video/mp4','video/quicktime','video/webm',
    'audio/webm','audio/mp4','audio/mpeg','audio/x-m4a','audio/m4a','audio/aac','audio/wav','audio/x-wav','audio/ogg'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop stale policies before recreating (idempotent re-runs).
DO $$ DECLARE
  p text;
  policies text[] := ARRAY[
    'event_media_public_read',
    'event_media_owner_admin_insert',
    'event_media_owner_admin_update',
    'event_media_owner_admin_delete'
  ];
BEGIN
  FOREACH p IN ARRAY policies LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = p
    ) THEN
      EXECUTE format('DROP POLICY %I ON storage.objects', p);
    END IF;
  END LOOP;
END $$;

-- Public read (anyone). Writes via service role (API) or owner/admin direct.
-- Path convention: tenants/{tenantId}/pov-events/{eventId}/{photos|videos|audio}/{guestId}/{file}
CREATE POLICY "event_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-media');

CREATE POLICY "event_media_owner_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-media'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin','staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

CREATE POLICY "event_media_owner_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'event-media'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin','staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );

CREATE POLICY "event_media_owner_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-media'
    AND auth.role() = 'authenticated'
    AND (
      public.is_owner()
      OR (
        COALESCE(auth.jwt() ->> 'role', '') IN ('admin','staff')
        AND (storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')
      )
    )
  );
