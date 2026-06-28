-- supabase/migrations/088_canva_pdf_visual_rsvp.sql
-- Visual extraction metadata, link/RSVP mapping, and event RSVP submissions.
-- Additive + idempotent.

ALTER TABLE public.website_canva_imports
  ADD COLUMN IF NOT EXISTS visual_extraction    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rendered_pages       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extracted_graphics   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS link_mapping         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rsvp_mapping         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS interactive_overlays jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── event_rsvps ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  website_id   uuid        NOT NULL,
  pov_event_id uuid,
  event_id     uuid,
  name         text        NOT NULL,
  phone        text,
  email        text,
  attending    boolean,
  guest_count  integer     NOT NULL DEFAULT 1,
  message      text,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_rsvps_tenant_idx   ON public.event_rsvps(tenant_id);
CREATE INDEX IF NOT EXISTS event_rsvps_website_idx  ON public.event_rsvps(website_id);
CREATE INDEX IF NOT EXISTS event_rsvps_pov_event_idx ON public.event_rsvps(pov_event_id);
CREATE INDEX IF NOT EXISTS event_rsvps_created_at_idx ON public.event_rsvps(created_at);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON public.event_rsvps;
CREATE POLICY service_role_all ON public.event_rsvps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS event_rsvps_owner ON public.event_rsvps;
CREATE POLICY event_rsvps_owner ON public.event_rsvps
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'role') = 'owner');

DROP POLICY IF EXISTS event_rsvps_admin ON public.event_rsvps;
CREATE POLICY event_rsvps_admin ON public.event_rsvps
  FOR ALL TO authenticated
  USING  (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'))
  WITH CHECK (tenant_id::text = (auth.jwt() ->> 'tenant_id') AND (auth.jwt() ->> 'role') IN ('admin','staff'));

-- Public insert for RSVP submissions (anon/authenticated guests)
DROP POLICY IF EXISTS event_rsvps_public_insert ON public.event_rsvps;
CREATE POLICY event_rsvps_public_insert ON public.event_rsvps
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
