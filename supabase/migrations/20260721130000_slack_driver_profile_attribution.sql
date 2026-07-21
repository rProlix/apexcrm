-- Make Slack uploaders durable driver identities and link every Slack inspection
-- and upload session to the corresponding profile. Also backfill pre-Phase-3D
-- inspections so driver/van/day history is available immediately.

ALTER TABLE public.van_damage_inspections
  ADD COLUMN IF NOT EXISTS driver_profile_id uuid
  REFERENCES public.van_slack_user_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.van_damage_upload_sessions
  ADD COLUMN IF NOT EXISTS driver_profile_id uuid
  REFERENCES public.van_slack_user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS van_damage_inspections_driver_profile_idx
  ON public.van_damage_inspections (tenant_id, business_id, driver_profile_id, slack_upload_at DESC);

CREATE INDEX IF NOT EXISTS van_damage_upload_sessions_driver_profile_time_idx
  ON public.van_damage_upload_sessions (tenant_id, business_id, driver_profile_id, upload_started_at DESC);

CREATE OR REPLACE FUNCTION public.van_damage_link_slack_driver_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snapshot jsonb := COALESCE(NEW.driver_snapshot, '{}'::jsonb);
  profile_uuid uuid;
BEGIN
  IF NEW.slack_team_id IS NULL OR NEW.slack_user_id IS NULL THEN
    NEW.driver_profile_id := NULL;
    RETURN NEW;
  END IF;

  INSERT INTO public.van_slack_user_profiles (
    tenant_id,
    business_id,
    slack_team_id,
    slack_user_id,
    display_name,
    real_name,
    username,
    avatar_url,
    last_resolved_at
  ) VALUES (
    NEW.tenant_id,
    NEW.business_id,
    NEW.slack_team_id,
    NEW.slack_user_id,
    NULLIF(snapshot ->> 'displayName', ''),
    NULLIF(snapshot ->> 'realName', ''),
    NULLIF(snapshot ->> 'username', ''),
    NULLIF(snapshot ->> 'avatarUrl', ''),
    CASE
      WHEN COALESCE(snapshot ->> 'displayName', snapshot ->> 'realName', snapshot ->> 'username', snapshot ->> 'avatarUrl') IS NOT NULL
        THEN now()
      ELSE NULL
    END
  )
  ON CONFLICT (tenant_id, slack_team_id, slack_user_id) DO UPDATE SET
    business_id = EXCLUDED.business_id,
    display_name = COALESCE(EXCLUDED.display_name, van_slack_user_profiles.display_name),
    real_name = COALESCE(EXCLUDED.real_name, van_slack_user_profiles.real_name),
    username = COALESCE(EXCLUDED.username, van_slack_user_profiles.username),
    avatar_url = COALESCE(EXCLUDED.avatar_url, van_slack_user_profiles.avatar_url),
    last_resolved_at = COALESCE(EXCLUDED.last_resolved_at, van_slack_user_profiles.last_resolved_at),
    updated_at = now()
  RETURNING id INTO profile_uuid;

  NEW.driver_profile_id := profile_uuid;
  NEW.driver_snapshot := jsonb_strip_nulls(
    jsonb_build_object(
      'slackWorkspaceId', NEW.slack_team_id,
      'slackUserId', NEW.slack_user_id
    ) || snapshot
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS van_damage_inspections_link_driver_profile
  ON public.van_damage_inspections;
CREATE TRIGGER van_damage_inspections_link_driver_profile
BEFORE INSERT OR UPDATE OF slack_team_id, slack_user_id, driver_snapshot
ON public.van_damage_inspections
FOR EACH ROW
EXECUTE FUNCTION public.van_damage_link_slack_driver_profile();

DROP TRIGGER IF EXISTS van_damage_upload_sessions_link_driver_profile
  ON public.van_damage_upload_sessions;
CREATE TRIGGER van_damage_upload_sessions_link_driver_profile
BEFORE INSERT OR UPDATE OF slack_team_id, slack_user_id, driver_snapshot
ON public.van_damage_upload_sessions
FOR EACH ROW
EXECUTE FUNCTION public.van_damage_link_slack_driver_profile();

-- Backfill one durable profile per tenant/workspace/uploader from legacy Slack
-- inspections. The Slack ID remains the identity even when users:read was not
-- available and only a fallback name can be displayed.
INSERT INTO public.van_slack_user_profiles (
  tenant_id,
  business_id,
  slack_team_id,
  slack_user_id,
  display_name,
  real_name,
  username,
  avatar_url,
  last_resolved_at
)
SELECT DISTINCT ON (i.tenant_id, i.slack_team_id, i.slack_user_id)
  i.tenant_id,
  i.business_id,
  i.slack_team_id,
  i.slack_user_id,
  NULLIF(i.driver_snapshot ->> 'displayName', ''),
  NULLIF(i.driver_snapshot ->> 'realName', ''),
  NULLIF(i.driver_snapshot ->> 'username', ''),
  NULLIF(i.driver_snapshot ->> 'avatarUrl', ''),
  CASE WHEN i.driver_snapshot <> '{}'::jsonb THEN now() ELSE NULL END
FROM public.van_damage_inspections i
WHERE i.source = 'slack'
  AND i.slack_team_id IS NOT NULL
  AND i.slack_user_id IS NOT NULL
ORDER BY i.tenant_id, i.slack_team_id, i.slack_user_id, i.created_at DESC
ON CONFLICT (tenant_id, slack_team_id, slack_user_id) DO UPDATE SET
  display_name = COALESCE(EXCLUDED.display_name, van_slack_user_profiles.display_name),
  real_name = COALESCE(EXCLUDED.real_name, van_slack_user_profiles.real_name),
  username = COALESCE(EXCLUDED.username, van_slack_user_profiles.username),
  avatar_url = COALESCE(EXCLUDED.avatar_url, van_slack_user_profiles.avatar_url),
  last_resolved_at = COALESCE(EXCLUDED.last_resolved_at, van_slack_user_profiles.last_resolved_at),
  updated_at = now();

UPDATE public.van_damage_inspections i
SET driver_profile_id = p.id,
    slack_upload_at = COALESCE(
      i.slack_upload_at,
      public.van_damage_slack_ts_to_timestamptz(i.slack_message_ts),
      i.created_at
    ),
    driver_snapshot = jsonb_strip_nulls(
      jsonb_build_object(
        'slackWorkspaceId', i.slack_team_id,
        'slackUserId', i.slack_user_id,
        'displayName', p.display_name,
        'realName', p.real_name,
        'username', p.username,
        'avatarUrl', p.avatar_url
      ) || COALESCE(i.driver_snapshot, '{}'::jsonb)
    )
FROM public.van_slack_user_profiles p
WHERE p.tenant_id = i.tenant_id
  AND p.business_id = i.business_id
  AND p.slack_team_id = i.slack_team_id
  AND p.slack_user_id = i.slack_user_id
  AND i.source = 'slack';

-- Reconstruct one upload session per historical Slack message. This preserves
-- separate same-day messages while grouping all images from one message.
INSERT INTO public.van_damage_upload_sessions (
  tenant_id,
  business_id,
  van_id,
  inspection_id,
  integration_id,
  driver_profile_id,
  source_key,
  slack_team_id,
  slack_channel_id,
  slack_user_id,
  slack_message_ts,
  slack_thread_ts,
  original_text,
  driver_snapshot,
  upload_started_at,
  ingested_at,
  first_image_id,
  image_count,
  status,
  damage_result,
  review_status,
  metadata
)
SELECT
  i.tenant_id,
  i.business_id,
  i.van_id,
  i.id,
  integration.id,
  i.driver_profile_id,
  i.tenant_id::text || ':' || i.slack_team_id || ':' || i.slack_channel_id || ':' || i.slack_message_ts,
  i.slack_team_id,
  i.slack_channel_id,
  i.slack_user_id,
  i.slack_message_ts,
  i.slack_thread_ts,
  COALESCE(i.metadata ->> 'slackMessageText', i.title),
  i.driver_snapshot,
  COALESCE(i.slack_upload_at, i.created_at),
  i.created_at,
  first_image.id,
  COALESCE(i.image_count, 0),
  i.status,
  CASE WHEN COALESCE(i.damage_count, 0) > 0 THEN 'damage_detected' ELSE 'no_damage_detected' END,
  COALESCE(i.review_status, 'pending'),
  jsonb_build_object('backfilledFromInspection', true)
FROM public.van_damage_inspections i
LEFT JOIN LATERAL (
  SELECT si.id
  FROM public.van_slack_integrations si
  WHERE si.tenant_id = i.tenant_id
    AND si.business_id = i.business_id
    AND si.slack_team_id = i.slack_team_id
  ORDER BY si.connected_at DESC NULLS LAST, si.created_at DESC
  LIMIT 1
) integration ON true
LEFT JOIN LATERAL (
  SELECT image.id
  FROM public.van_damage_images image
  WHERE image.inspection_id = i.id
  ORDER BY COALESCE(image.upload_order, image.original_file_index, 2147483647), image.created_at, image.id
  LIMIT 1
) first_image ON true
WHERE i.source = 'slack'
  AND i.slack_team_id IS NOT NULL
  AND i.slack_channel_id IS NOT NULL
  AND i.slack_message_ts IS NOT NULL
ON CONFLICT (tenant_id, source_key) DO UPDATE SET
  van_id = COALESCE(EXCLUDED.van_id, van_damage_upload_sessions.van_id),
  driver_profile_id = COALESCE(EXCLUDED.driver_profile_id, van_damage_upload_sessions.driver_profile_id),
  driver_snapshot = COALESCE(NULLIF(EXCLUDED.driver_snapshot, '{}'::jsonb), van_damage_upload_sessions.driver_snapshot),
  first_image_id = COALESCE(van_damage_upload_sessions.first_image_id, EXCLUDED.first_image_id),
  image_count = GREATEST(van_damage_upload_sessions.image_count, EXCLUDED.image_count),
  status = EXCLUDED.status,
  damage_result = EXCLUDED.damage_result,
  review_status = EXCLUDED.review_status,
  updated_at = now();

UPDATE public.van_damage_inspections i
SET upload_session_id = session.id,
    upload_source_key = session.source_key
FROM public.van_damage_upload_sessions session
WHERE session.inspection_id = i.id
  AND session.tenant_id = i.tenant_id;

WITH ordered_images AS (
  SELECT
    image.id,
    i.upload_session_id,
    row_number() OVER (
      PARTITION BY image.inspection_id
      ORDER BY image.created_at, image.id
    ) - 1 AS source_order
  FROM public.van_damage_images image
  JOIN public.van_damage_inspections i ON i.id = image.inspection_id
  WHERE i.upload_session_id IS NOT NULL
)
UPDATE public.van_damage_images image
SET upload_session_id = ordered.upload_session_id,
    upload_order = COALESCE(image.upload_order, ordered.source_order),
    original_file_index = COALESCE(image.original_file_index, ordered.source_order)
FROM ordered_images ordered
WHERE ordered.id = image.id;

CREATE OR REPLACE VIEW public.van_driver_daily_activity
WITH (security_invoker = true)
AS
SELECT
  session.tenant_id,
  session.business_id,
  session.driver_profile_id,
  session.van_id,
  (session.upload_started_at AT TIME ZONE 'UTC')::date AS activity_date,
  count(*)::integer AS upload_count,
  sum(session.image_count)::integer AS image_count,
  min(session.upload_started_at) AS first_upload_at,
  max(session.upload_started_at) AS last_upload_at
FROM public.van_damage_upload_sessions session
WHERE session.driver_profile_id IS NOT NULL
  AND session.van_id IS NOT NULL
GROUP BY
  session.tenant_id,
  session.business_id,
  session.driver_profile_id,
  session.van_id,
  (session.upload_started_at AT TIME ZONE 'UTC')::date;

GRANT SELECT ON public.van_driver_daily_activity TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.van_damage_link_slack_driver_profile() TO service_role;

NOTIFY pgrst, 'reload schema';
