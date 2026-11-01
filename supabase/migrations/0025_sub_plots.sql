-- 0025_sub_plots.sql — one plot, planted in blocks.
--
-- A planting that should take a week takes two months: the suwe arrives when
-- it arrives and the rain comes when it comes. So a plot is not one crop of
-- one age — it is a March block and a May block standing side by side, and
-- every figure the app computes for that plot has been quietly averaging them
-- together. Cost per plant, D-leaf, when to force: all of it.
--
-- Sub-plots make those blocks real. They belong to the cycle, not the plot,
-- because that is exactly their lifetime: he blocks out the land as he plants
-- it, and the next cycle blocks it out again differently.
--
-- The plot stays one plot. One polygon on the map, one page, one set of books.

create table if not exists sub_plots (
  id           uuid primary key default gen_random_uuid(),
  cycle_id     uuid not null references crop_cycles(id) on delete cascade,
  -- His name for the block: "A", "March", "by the road".
  name         text not null check (length(btrim(name)) > 0),
  planted_on   date not null,
  -- His estimate of how much of the plot this block is. Pacing a field, not
  -- surveying it, so it is a percentage and not an area.
  land_pct     numeric(5,2) not null check (land_pct > 0 and land_pct <= 100),
  -- Counted, not estimated. This is the number the farm trusts.
  plant_count  integer check (plant_count >= 0),
  -- Forcing is per block, because planting date is why blocks exist at all.
  target_forcing_date date,
  forced_on    date,
  note         text,
  created_at   timestamptz not null default now(),
  created_by   text references app_users(email),
  unique (cycle_id, name),
  constraint sub_plot_planting_in_range
    check (planted_on >= date '2015-01-01' and planted_on <= current_date + 30)
);

create index if not exists sub_plots_by_cycle on sub_plots (cycle_id, planted_on);

-- ---------------------------------------------------------------------------
-- The blocks cannot add up to more land than the plot has
-- ---------------------------------------------------------------------------
-- They may add up to less: he blocks out the land as he plants it, and for
-- most of those two months the plot is only partly spoken for. That is a real
-- state and the app reports it rather than hiding it. More than all of it is
-- not a real state.
--
-- Deferred, so he can re-cut three blocks in one transaction without the
-- intermediate arithmetic refusing him.

create or replace function check_sub_plot_land()
returns trigger language plpgsql as $$
declare
  target uuid := coalesce(new.cycle_id, old.cycle_id);
  total  numeric;
begin
  select coalesce(sum(land_pct), 0) into total from sub_plots where cycle_id = target;
  if total > 100.01 then
    -- Spelled out rather than escaped: in plpgsql the percent sign is the
    -- placeholder, and "%%%" reads as a literal percent followed by the value.
    raise exception 'the blocks add up to % percent of the plot, which is more than all of it',
      round(total, 1);
  end if;
  return null;
end $$;

drop trigger if exists sub_plots_land_total on sub_plots;
create constraint trigger sub_plots_land_total
  after insert or update or delete on sub_plots
  deferrable initially deferred
  for each row execute function check_sub_plot_land();

-- ---------------------------------------------------------------------------
-- What a block owns
-- ---------------------------------------------------------------------------
-- A cost, a plant count and a leaf reading can each name a block. All three
-- stay nullable: a cost for the whole plot names none, and is divided across
-- the blocks when anything reads it rather than at the moment it is saved.
--
-- That ordering is the whole design. He creates the blocks in month two, by
-- which time month one's costs are already in the books; and he will revise
-- his percentages when he sees the land again. Dividing at save time would
-- leave the early costs undivided for ever and freeze the first guess into
-- every figure after it. Dividing at read time means a corrected percentage
-- corrects the history with it.

alter table expense_allocations
  add column if not exists sub_plot_id uuid references sub_plots(id) on delete set null;
create index if not exists expense_allocations_by_sub_plot
  on expense_allocations (sub_plot_id) where sub_plot_id is not null;

alter table plant_count_observations
  add column if not exists sub_plot_id uuid references sub_plots(id) on delete cascade;

alter table leaf_measurements
  add column if not exists sub_plot_id uuid references sub_plots(id) on delete cascade;

-- One reading per block per day, and still one per plot per day for a reading
-- that names no block. "nulls not distinct" is what keeps the second promise:
-- without it two whole-plot readings could share a date again.
alter table plant_count_observations drop constraint if exists plant_count_observations_cycle_id_date_key;
drop index if exists plant_counts_one_a_day;
create unique index plant_counts_one_a_day
  on plant_count_observations (cycle_id, sub_plot_id, date) nulls not distinct;

alter table leaf_measurements drop constraint if exists leaf_measurements_cycle_id_date_key;
drop index if exists leaf_one_a_day;
create unique index leaf_one_a_day
  on leaf_measurements (cycle_id, sub_plot_id, date) nulls not distinct;

-- ---------------------------------------------------------------------------
-- The old D-leaf readings are set aside, not destroyed
-- ---------------------------------------------------------------------------
-- The owners' technical consultant has told them the method behind every
-- reading taken so far was wrong, and they are starting again. So these must
-- stop appearing anywhere a current figure appears — a wrong number on a
-- screen is worse than no number.
--
-- Set aside rather than deleted. They are a true record of what was done on
-- those mornings, the costs and dates around them are real, and "we measured
-- the wrong thing until November 2026" is itself a fact about this farm worth
-- being able to look up. Nothing in the app reads them any more.

alter table leaf_measurements
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_reason text;

update leaf_measurements
   set superseded_at = now(),
       superseded_reason = 'Measured by the old method, which the farm''s '
                           'technical consultant has since corrected. Kept as '
                           'a record of what was done, not as a measurement.'
 where superseded_at is null;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
do $$
begin
  alter table sub_plots enable row level security;
  alter table sub_plots force row level security;
  revoke all on table sub_plots from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table sub_plots from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on table sub_plots to authenticated;
  end if;
  drop policy if exists sub_plots_read on sub_plots;
  create policy sub_plots_read on sub_plots for select using (is_allowed());
  -- Blocking out the land is the farm manager's job: he is the one standing
  -- in it. Deleting stays with the owners, as everywhere else.
  drop policy if exists sub_plots_insert on sub_plots;
  create policy sub_plots_insert on sub_plots for insert with check (is_allowed());
  drop policy if exists sub_plots_update on sub_plots;
  create policy sub_plots_update on sub_plots
    for update using (is_allowed()) with check (is_allowed());
  drop policy if exists sub_plots_delete on sub_plots;
  create policy sub_plots_delete on sub_plots for delete using (is_allowed());
end $$;

comment on table sub_plots is
  'Blocks within one plot, planted on different dates because the planting '
  'material and the weather arrive when they arrive. They belong to the cycle '
  'and retire with it; the plot stays one plot on the map and on its page.';
