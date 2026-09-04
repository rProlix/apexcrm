-- Remove the no-longer-needed assignment target from cancellation point refunds.
DO $fix$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.cancel_reward_redemption(uuid,uuid,uuid,text)'::regprocedure
  ) INTO definition;
  definition := replace(
    definition,
    'DECLARE redemption reward_redemptions%ROWTYPE; item reward_shop_items%ROWTYPE; ignored record;',
    'DECLARE redemption reward_redemptions%ROWTYPE; item reward_shop_items%ROWTYPE;'
  );
  definition := replace(definition, 'SELECT * INTO ignored FROM apply_reward_points(', 'PERFORM * FROM apply_reward_points(');
  IF position('INTO ignored' IN definition) > 0 THEN
    RAISE EXCEPTION 'Unable to patch cancel_reward_redemption safely';
  END IF;
  EXECUTE definition;
END
$fix$;
