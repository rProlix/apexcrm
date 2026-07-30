-- Keep the durable upload-session and vehicle profile projection synchronized
-- with the aggregate multi-image inspection lifecycle.

CREATE OR REPLACE FUNCTION public.van_damage_sync_terminal_inspection_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.van_id IS NULL
    OR NEW.status NOT IN ('completed', 'needs_review', 'failed')
    OR NOT (
      OLD.status IS DISTINCT FROM NEW.status
      OR OLD.van_id IS DISTINCT FROM NEW.van_id
    )
  THEN
    RETURN NEW;
  END IF;

  PERFORM public.van_damage_reconcile_cases_for_inspection(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS van_damage_inspections_sync_terminal_profile
  ON public.van_damage_inspections;
CREATE TRIGGER van_damage_inspections_sync_terminal_profile
AFTER UPDATE OF status, van_id ON public.van_damage_inspections
FOR EACH ROW
EXECUTE FUNCTION public.van_damage_sync_terminal_inspection_profile();

-- The multi-image aggregate migration predates this projection trigger.
-- Reconcile only terminal inspections whose upload session is demonstrably
-- stale, so existing case observations are not counted a second time.
DO $$
DECLARE
  inspection_record record;
BEGIN
  FOR inspection_record IN
    SELECT inspection.id
    FROM public.van_damage_inspections inspection
    JOIN public.van_damage_upload_sessions session
      ON session.id = inspection.upload_session_id
     AND session.tenant_id = inspection.tenant_id
     AND session.business_id = inspection.business_id
    WHERE inspection.van_id IS NOT NULL
      AND inspection.status IN ('completed', 'needs_review', 'failed')
      AND (
        session.van_id IS DISTINCT FROM inspection.van_id
        OR session.status IS DISTINCT FROM inspection.status
      )
    ORDER BY inspection.created_at, inspection.id
  LOOP
    PERFORM public.van_damage_reconcile_cases_for_inspection(inspection_record.id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.van_damage_sync_terminal_inspection_profile()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.van_damage_sync_terminal_inspection_profile()
  TO service_role;

NOTIFY pgrst, 'reload schema';
