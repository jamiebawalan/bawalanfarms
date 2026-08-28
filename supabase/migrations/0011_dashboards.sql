-- 0011_dashboards.sql — what the two dashboards need.

-- ---------------------------------------------------------------------------
-- 1. In-farm logistics gets its own category
-- ---------------------------------------------------------------------------
-- 'Farm Transport' existed from the start but nothing ever routed to it, so
-- hauling within the farm sat in Labor and could not be told apart from the
-- work itself. Moving water and planting material around the farm is a
-- different question from getting fruit to market, and the owners want to see
-- them separately.
--
-- Only the pre-fill changes. Expenses already recorded keep the category they
-- were saved with — rewriting history to match a new opinion is how a ledger
-- stops being trustworthy. See the note at the end of this file for a backfill
-- if you decide you want one.

update activities set default_category = 'Farm Transport'
 where code in ('hakot_material', 'material_collection', 'igib', 'kamada');

insert into activities (code, label, activity_group, default_category, sort_order) values
  ('hakot_farm', 'Hakot (hauling inside the farm)', 'Machines & transport', 'Farm Transport', 705),
  ('fuel_farm', 'Diesel for farm hauling', 'Machines & transport', 'Farm Transport', 706)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Farm settings — the few numbers the reports assume
-- ---------------------------------------------------------------------------
-- Kept as rows rather than constants in code so the owners can correct them
-- without a deploy, and so every assumption has one visible home.

create table if not exists farm_settings (
  key         text primary key,
  value       numeric not null,
  unit        text,
  description text not null,
  updated_at  timestamptz not null default now()
);

insert into farm_settings (key, value, unit, description) values
  ('max_plants_per_sqm', 3.3, 'plants/sqm',
   'Densest planting achieved on the farm so far (plot 6, 18,422 plants on 5,534 sqm). '
   'Used as the ceiling when judging how fully a plot is planted.'),
  ('pineapple_months_to_harvest', 18, 'months',
   'Typical months from planting to first harvest, used to project a harvest date '
   'when no D-leaf reading is available.'),
  ('dleaf_ready_cm', 100, 'cm',
   'D-leaf length at which a pineapple plant is considered ready for forcing. '
   'Projections use the measured growth rate to estimate when this is reached.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. When the harvest was meant to happen
-- ---------------------------------------------------------------------------
alter table crop_cycles
  add column if not exists target_harvest_date date;

comment on column crop_cycles.target_harvest_date is
  'What was planned when the cycle started. Kept alongside the projection so '
  'slippage is visible rather than quietly absorbed.';

-- ---------------------------------------------------------------------------
-- 4. D-leaf measurements
-- ---------------------------------------------------------------------------
-- The D-leaf is the tallest mature leaf, and its length is how pineapple growers
-- judge whether a plant is ready to force. Like plant counts, these are periodic
-- observations and are never overwritten: the growth rate between them is what
-- makes a harvest date projectable at all.

create table if not exists leaf_measurements (
  id           uuid primary key default gen_random_uuid(),
  cycle_id     uuid not null references crop_cycles(id) on delete cascade,
  date         date not null,
  avg_length_cm numeric(6,2) not null check (avg_length_cm > 0),
  sample_size  integer check (sample_size > 0),
  note         text,
  created_at   timestamptz not null default now(),
  created_by   text references app_users(email),
  unique (cycle_id, date),
  constraint leaf_date_in_range
    check (date >= date '2015-01-01' and date <= current_date + 30)
);
create index if not exists leaf_measurements_lookup
  on leaf_measurements (cycle_id, date desc);

-- ---------------------------------------------------------------------------
-- 5. Tasks
-- ---------------------------------------------------------------------------
-- Deliberately thin. This is a list of what needs doing on which plot this
-- week, not a project manager: a title, a due date, and whether it is done.

create table if not exists tasks (
  id         uuid primary key default gen_random_uuid(),
  plot_id    uuid references plots(id) on delete cascade,
  cycle_id   uuid references crop_cycles(id) on delete cascade,
  title      text not null check (length(btrim(title)) > 2),
  activity   text references activities(code),
  due_date   date not null,
  -- Critical tasks are the ones the manager dashboard leads with.
  is_critical boolean not null default false,
  done_at    timestamptz,
  note       text,
  created_at timestamptz not null default now(),
  created_by text references app_users(email)
);
create index if not exists tasks_due on tasks (due_date) where done_at is null;
create index if not exists tasks_plot on tasks (plot_id, due_date);

-- ---------------------------------------------------------------------------
-- 6. Access
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['farm_settings', 'leaf_measurements', 'tasks']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on table %I from public', t);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant select, insert, update, delete on table %I to authenticated', t);
    end if;
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (is_allowed())', t || '_read', t);
  end loop;

  -- Measurements and tasks are the farm manager's daily work.
  foreach t in array array['leaf_measurements', 'tasks']
  loop
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format(
      'create policy %I on %I for all using (is_allowed()) with check (is_allowed())',
      t || '_write', t);
  end loop;

  -- Settings change what every report means, so they stay with the owners.
  execute 'drop policy if exists farm_settings_write on farm_settings';
  execute 'create policy farm_settings_write on farm_settings for all
             using (is_owner()) with check (is_owner())';
end $$;

-- ---------------------------------------------------------------------------
-- Optional: reclassify historical in-farm logistics
-- ---------------------------------------------------------------------------
-- Not run automatically. If you want past Hakot, Kamada, Igib and Material
-- Collection rows moved out of Labor and into Farm Transport as well, run:
--
--   update expenses set category = 'Farm Transport'
--    where activity in ('hakot_material','material_collection','igib','kamada')
--      and category = 'Labor';
--
-- It changes what your past reports say, so it is your call, not mine.
