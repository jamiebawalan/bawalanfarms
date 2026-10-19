-- 0024_biomass.sql — weight beside length, on the same plants.
--
-- Del Monte's agronomists advised weighing as well as measuring. Length says
-- how far a plant has stretched; weight says how much plant is actually there,
-- and two blocks at the same D-leaf length can carry very different crops.
-- Forcing a light block makes small fruit, which is the outcome this farm is
-- deliberately trying to avoid (D010: aim for larger fruit, because the
-- economics work better as the harvest tends toward primera).
--
-- The weight goes on the plant row, not in a table of its own. It is the same
-- twenty plants, picked at random on the same morning, and splitting them
-- across two records would invite a reading where the lengths and the weights
-- came from different plants — which is worse than having no weights at all.
--
-- Nullable, because every reading taken before today has no weight and a
-- history that refuses to load is not history.

alter table leaf_plant_readings
  add column if not exists weight_grams numeric(7,2)
    check (weight_grams > 0 and weight_grams <= 20000);

-- ---------------------------------------------------------------------------
-- What was put on the scale
-- ---------------------------------------------------------------------------
-- "Biomass" names two different numbers: the D-leaf itself, pulled and weighed
-- beside the one just measured, or the whole plant cut at the base. Both are
-- used, their thresholds are nothing like each other, and a column of grams
-- with no record of which one it is becomes unreadable the moment the person
-- who took it stops being asked. So the reading says.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'biomass_basis') then
    create type biomass_basis as enum ('d_leaf', 'whole_plant');
  end if;
end $$;

alter table leaf_measurements
  add column if not exists avg_weight_grams numeric(7,2),
  add column if not exists biomass_basis biomass_basis;

-- A reading either weighed nothing, or says what it weighed. Grams with no
-- basis is the unreadable column this is here to prevent.
alter table leaf_measurements drop constraint if exists weight_needs_basis;
alter table leaf_measurements add constraint weight_needs_basis
  check (avg_weight_grams is null or biomass_basis is not null);

-- ---------------------------------------------------------------------------
-- The header still cannot drift from the rows
-- ---------------------------------------------------------------------------
-- Same rule as the average length: computed from what was entered, never typed.
-- Weights are averaged over the plants that have one, so a morning where he
-- measured twenty and weighed eight still reports both honestly.

create or replace function sync_leaf_average()
returns trigger language plpgsql as $$
declare
  target uuid := coalesce(new.measurement_id, old.measurement_id);
  n integer;
  mean numeric;
  weighed integer;
  mean_g numeric;
begin
  select count(*), avg(length_cm),
         count(weight_grams), avg(weight_grams)
    into n, mean, weighed, mean_g
    from leaf_plant_readings where measurement_id = target;

  if n > 0 then
    update leaf_measurements
       set avg_length_cm = round(mean, 2),
           sample_size = n,
           avg_weight_grams = case when weighed > 0 then round(mean_g, 2) end,
           -- Clearing every weight clears the basis with it, or the row would
           -- keep claiming to have weighed something it no longer has.
           biomass_basis = case when weighed > 0 then biomass_basis end
     where id = target;
  end if;
  return null;
end $$;

drop trigger if exists leaf_plants_sync on leaf_plant_readings;
create trigger leaf_plants_sync
  after insert or update or delete on leaf_plant_readings
  for each row execute function sync_leaf_average();

comment on column leaf_plant_readings.weight_grams is
  'What this plant weighed, in grams. Null when only the length was taken. '
  'Whether this is the D-leaf or the whole plant is on the reading itself.';
