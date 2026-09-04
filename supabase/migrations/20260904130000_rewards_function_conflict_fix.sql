-- Qualify retry-path columns that collide with RETURNS TABLE output names.
DO $fix$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.apply_reward_punch(uuid,uuid,uuid,text,uuid,text,integer,uuid,jsonb)'::regprocedure
  ) INTO definition;
  definition := replace(
    definition,
    'SELECT punch_card_id FROM reward_punch_card_events WHERE id = existing_event',
    'SELECT event.punch_card_id FROM reward_punch_card_events event WHERE event.id = existing_event'
  );
  IF position('SELECT event.punch_card_id' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unable to patch apply_reward_punch safely';
  END IF;
  EXECUTE definition;

  SELECT pg_get_functiondef(
    'public.redeem_reward_catalog_item(uuid,uuid,uuid,uuid,text,text,text)'::regprocedure
  ) INTO definition;
  definition := replace(
    definition,
    'SELECT coalesce(points_balance, 0) INTO balance FROM rewards_balances
      WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id;',
    'SELECT coalesce(rb.points_balance, 0) INTO balance FROM rewards_balances rb
      WHERE rb.tenant_id = p_tenant_id AND rb.customer_id = p_customer_id;'
  );
  IF position('coalesce(rb.points_balance' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unable to patch redeem_reward_catalog_item safely';
  END IF;
  EXECUTE definition;
END
$fix$;
