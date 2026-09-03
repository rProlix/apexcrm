-- Repair database objects that were left invalid by earlier forward migrations.

ALTER TABLE public.payment_accounts
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.payment_accounts.metadata IS
  'Non-secret provider connection metadata. OAuth credentials must not be stored here.';

CREATE OR REPLACE FUNCTION public.increment_punch_card(
  p_punch_card_id uuid,
  p_punches integer DEFAULT 1
)
RETURNS TABLE(current_punches integer, status text, completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal integer;
  v_current integer;
  v_status text;
BEGIN
  UPDATE public.reward_punch_cards AS punch_card
  SET
    current_punches = LEAST(punch_card.punch_goal, punch_card.current_punches + p_punches),
    status = CASE
      WHEN (punch_card.current_punches + p_punches) >= punch_card.punch_goal THEN 'completed'
      ELSE punch_card.status
    END,
    updated_at = now()
  WHERE punch_card.id = p_punch_card_id
    AND punch_card.status = 'active'
  RETURNING punch_card.punch_goal, punch_card.current_punches, punch_card.status
  INTO v_goal, v_current, v_status;

  RETURN QUERY SELECT v_current, v_status, (v_status = 'completed');
END;
$$;
