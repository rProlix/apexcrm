BEGIN;

ALTER TABLE public.van_damage_items
  DROP CONSTRAINT IF EXISTS van_damage_items_vehicle_area_check;

ALTER TABLE public.van_damage_items
  ADD CONSTRAINT van_damage_items_vehicle_area_check CHECK (
    vehicle_area IS NULL OR vehicle_area IN (
      'front_bumper',
      'front_bumper_driver',
      'front_bumper_passenger',
      'rear_bumper',
      'rear_bumper_driver',
      'rear_bumper_passenger',
      'driver_side',
      'passenger_side',
      'roof',
      'roof_front',
      'roof_center',
      'roof_rear',
      'driver_roof_edge',
      'passenger_roof_edge',
      'hood',
      'windshield',
      'door',
      'driver_front_door',
      'passenger_front_door',
      'driver_sliding_door',
      'passenger_sliding_door',
      'driver_rear_door',
      'passenger_rear_door',
      'driver_rear_lower_door',
      'passenger_rear_lower_door',
      'rear_door_center_seam',
      'driver_front_fender',
      'passenger_front_fender',
      'driver_cargo_panel',
      'passenger_cargo_panel',
      'driver_rear_cargo_panel',
      'passenger_rear_cargo_panel',
      'driver_rear_quarter',
      'passenger_rear_quarter',
      'driver_rocker_panel',
      'passenger_rocker_panel',
      'mirror',
      'driver_mirror',
      'passenger_mirror',
      'wheel',
      'driver_front_wheel',
      'passenger_front_wheel',
      'driver_rear_wheel',
      'passenger_rear_wheel',
      'driver_headlight',
      'passenger_headlight',
      'driver_taillight',
      'passenger_taillight',
      'upper_grille',
      'lower_grille',
      'interior',
      'unknown'
    )
  );

COMMENT ON CONSTRAINT van_damage_items_vehicle_area_check ON public.van_damage_items IS
  'Allows the canonical 2019 Ford Transit regions emitted by damage analysis and rendered by the vehicle damage map.';

COMMIT;
