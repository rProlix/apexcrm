ALTER TABLE public.van_damage_items
  DROP CONSTRAINT IF EXISTS van_damage_items_damage_type_check;

ALTER TABLE public.van_damage_items
  ADD CONSTRAINT van_damage_items_damage_type_check
  CHECK (
    damage_type IS NULL OR damage_type IN (
      'dirt_debris',
      'dent',
      'scratch',
      'crack',
      'broken_light',
      'broken_mirror',
      'paint_damage',
      'bumper_damage',
      'glass_damage',
      'tire_wheel_damage',
      'interior_damage',
      'unknown'
    )
  );
