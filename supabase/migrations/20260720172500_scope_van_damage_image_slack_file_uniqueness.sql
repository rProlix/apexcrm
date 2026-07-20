DROP INDEX IF EXISTS public.van_damage_images_slack_file_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS van_damage_images_inspection_slack_file_uidx
  ON public.van_damage_images (tenant_id, inspection_id, slack_file_id)
  WHERE slack_file_id IS NOT NULL;
