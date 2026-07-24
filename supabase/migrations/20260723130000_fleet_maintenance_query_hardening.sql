-- Fleet Maintenance query hardening
-- Additive and safe to roll back by dropping only these indexes.
-- The authoritative tables remain those created by
-- 20260723090000_level3_attribution_fleet_maintenance.sql.

CREATE INDEX IF NOT EXISTS fleet_maintenance_priority_idx
  ON public.fleet_maintenance_items (tenant_id, effective_priority, latest_activity_at DESC);

CREATE INDEX IF NOT EXISTS fleet_maintenance_latest_activity_idx
  ON public.fleet_maintenance_items (tenant_id, latest_activity_at DESC, id);

CREATE INDEX IF NOT EXISTS fleet_maintenance_slack_lookup_idx
  ON public.fleet_maintenance_items (
    tenant_id, slack_team_id, slack_channel_id, slack_message_ts
  )
  WHERE source = 'slack';

CREATE INDEX IF NOT EXISTS fleet_maintenance_related_inspection_idx
  ON public.fleet_maintenance_items (tenant_id, related_inspection_id)
  WHERE related_inspection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fleet_maintenance_related_damage_case_idx
  ON public.fleet_maintenance_items (tenant_id, related_damage_case_id)
  WHERE related_damage_case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fleet_maintenance_slack_thread_idx
  ON public.fleet_maintenance_history (
    tenant_id, slack_channel_id, slack_message_ts, occurred_at
  )
  WHERE slack_message_ts IS NOT NULL;

NOTIFY pgrst, 'reload schema';
