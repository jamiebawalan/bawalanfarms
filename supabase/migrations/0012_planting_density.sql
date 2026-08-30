-- ---------------------------------------------------------------------------
-- The planting density the farm is aiming for
-- ---------------------------------------------------------------------------
-- 0011 measured "how fully is this plot planted" against 3.3 plants/sqm — the
-- densest the farm has ever managed, on plot 6. The owners' working density is
-- 25,000 plants a hectare, which is 2.5 per sqm, and that is what the dashboard
-- should measure against: a plot planted as intended ought to read as full, not
-- as a third short of a record nobody is trying to beat.
--
-- The key is renamed as well as revalued, because a number that means "what we
-- aim for" should not be called a maximum.

insert into farm_settings (key, value, unit, description) values
  ('target_plants_per_sqm', 2.5, 'plants/sqm',
   'Working planting density the farm aims for: 25,000 pineapple plants per '
   'hectare. Used to judge how fully a plot is planted. The densest ever '
   'achieved was 3.3/sqm on plot 6, but that is a record, not the target.')
on conflict (key) do update
  set value = excluded.value,
      unit = excluded.unit,
      description = excluded.description,
      updated_at = now();

delete from farm_settings where key = 'max_plants_per_sqm';
