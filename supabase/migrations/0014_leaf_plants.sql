-- ---------------------------------------------------------------------------
-- D-leaf: the individual plants behind the average
-- ---------------------------------------------------------------------------
-- Anthony picks plants at random and measures each one. Until now the app took
-- only the average he worked out, which threw away the thing that matters most
-- after the mean: the spread. A block averaging 57 cm made of plants between 27
-- and 79 is a different crop from one made of plants between 54 and 60, and the
-- farm has already decided to manage that difference — sorting planting
-- material by size, so the block grows and forces together.
--
-- The average is no longer entered. It is computed from the rows, by a trigger,
-- so it cannot drift from the numbers it came from.

create table if not exists leaf_plant_readings (
  measurement_id uuid not null references leaf_measurements(id) on delete cascade,
  plant_no       integer not null check (plant_no between 1 and 50),
  length_cm      numeric(6,2) not null check (length_cm > 0 and length_cm <= 300),
  primary key (measurement_id, plant_no)
);

create index if not exists leaf_plant_readings_by_measurement
  on leaf_plant_readings (measurement_id);

-- ---------------------------------------------------------------------------
-- Keep the header honest
-- ---------------------------------------------------------------------------
-- A reading entered plant by plant owns its average. One imported as an average
-- alone — which is all the older records have — keeps the number it was given,
-- because there are no rows to recompute it from.

create or replace function sync_leaf_average()
returns trigger language plpgsql as $$
declare
  target uuid := coalesce(new.measurement_id, old.measurement_id);
  n integer;
  mean numeric;
begin
  select count(*), avg(length_cm) into n, mean
    from leaf_plant_readings where measurement_id = target;

  if n > 0 then
    update leaf_measurements
       set avg_length_cm = round(mean, 2),
           sample_size = n
     where id = target;
  end if;
  return null;
end $$;

drop trigger if exists leaf_plants_sync on leaf_plant_readings;
create trigger leaf_plants_sync
  after insert or update or delete on leaf_plant_readings
  for each row execute function sync_leaf_average();

-- ---------------------------------------------------------------------------
-- How many plants to measure
-- ---------------------------------------------------------------------------
-- The owner's sheet records twenty, not ten. Twenty is the sample the farm
-- actually takes, so it is what the form should offer.
update farm_settings
   set value = 20,
       description = 'How many plants to measure at random for a D-leaf reading. '
                     'The owner''s own records use twenty.',
       updated_at = now()
 where key = 'dleaf_sample_size';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
do $$
begin
  alter table leaf_plant_readings enable row level security;
  alter table leaf_plant_readings force row level security;
  revoke all on table leaf_plant_readings from public;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on table leaf_plant_readings to authenticated;
  end if;
  drop policy if exists leaf_plant_readings_all on leaf_plant_readings;
  create policy leaf_plant_readings_all on leaf_plant_readings
    for all using (is_allowed()) with check (is_allowed());
end $$;
