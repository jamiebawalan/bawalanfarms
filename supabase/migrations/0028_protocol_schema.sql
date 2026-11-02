-- 0028_protocol_schema.sql — the protocol, as data the farm can edit.
--
-- "Bawalan Farms Pineapple Protocol v1.0" pins every activity to a month
-- after planting. This holds that schedule in tables rather than in code,
-- because the document is v1.0 with nine open items and seven consultations
-- behind it: a revision should be rows, not a deploy.
--
-- Three things in here are easy to get wrong and expensive to get wrong, so
-- each is a column rather than a convention.

-- ---------------------------------------------------------------------------
-- What the farm buys and puts on the ground
-- ---------------------------------------------------------------------------
create table if not exists materials (
  code        text primary key,
  name        text not null,
  -- fertiliser | foliar | herbicide | insecticide | fungicide | amendment | other
  kind        text not null,
  -- The analysis where it has one: "18-46-0", "0-0-60".
  analysis    text,
  -- What a quantity of it is measured in: kg, L.
  unit        text not null check (unit in ('kg', 'L')),
  note        text,
  active      boolean not null default true,
  sort_order  integer not null default 100
);

-- ---------------------------------------------------------------------------
-- The schedule
-- ---------------------------------------------------------------------------
create table if not exists protocol_activities (
  code        text primary key,
  -- Months after planting. Fractional and negative are both real: MAP -6 is
  -- six months before planting, MAP 0.5 is the mortality check a fortnight in.
  map_month   numeric(4,1) not null,
  category    text not null,
  title       text not null,
  instruction text not null,

  /*
   * How quantities scale. Getting this wrong is the single most expensive
   * mistake available here: lime is 500 kg per 1,000 m², and scaling it by
   * plant count instead would be wrong by a factor of thousands.
   */
  basis       text not null default 'none'
                check (basis in ('per_plant', 'per_area', 'none')),

  /*
   * Activities that repeat. Doing the month-5 foliar means the month-4 foliar
   * is past, not pending — they are rounds of one programme, and a missed
   * round is not something you go back and add. Activities in different
   * series never close each other: fertilising does not mean the drainage
   * was dug.
   */
  series      text,

  /*
   * How many months late this is still worth doing. Null means the window
   * shuts with its own month — you cannot re-do land prep under a standing
   * crop, or force a plot that is past forcing.
   *
   * Authored, never inferred. Whether a late activity is worth the material
   * is an agronomy judgement, and the app has no business guessing at it.
   */
  recoverable_months integer check (recoverable_months >= 0),

  /*
   * Mutually exclusive options for one decision — DAP or ammonium sulfate at
   * MAP 2, never both. Shown as one choice rather than two jobs, with the
   * default pre-selected, because the farm manager cannot read a soil test.
   */
  choice_group text,
  is_default   boolean not null default false,
  condition    text,

  sort_order  integer not null default 100
);

create index if not exists protocol_activities_by_month
  on protocol_activities (map_month, sort_order);

-- ---------------------------------------------------------------------------
-- What each activity consumes
-- ---------------------------------------------------------------------------
create table if not exists protocol_activity_materials (
  activity_code text not null references protocol_activities(code) on delete cascade,
  material_code text not null references materials(code),
  -- Read against the activity's basis: grams per plant, or per 1,000 m².
  qty           numeric(12,4) not null check (qty > 0),
  qty_unit      text not null check (qty_unit in ('g_per_plant', 'g_per_1000sqm', 'ml_per_1000sqm')),
  -- Dissolve in this order; urea last. Null for anything not mixed in a tank.
  mix_order     integer,
  note          text,
  primary key (activity_code, material_code)
);

-- ---------------------------------------------------------------------------
-- Where a block actually sits on the schedule
-- ---------------------------------------------------------------------------
-- MAP is not calendar age. Plots already planted when the protocol was adopted
-- sit on it by growth stage: Plot 24 is at MAP 8 though it was planted in
-- December 2025.
--
-- Stored as a date rather than a month number on purpose. A stored "month 8"
-- is wrong four weeks later and would need re-entering across twenty-seven
-- plots every month, for ever. A date advances by itself. The farm manager
-- still enters the stage he can see — the app turns it into this date once.

alter table crop_cycles
  add column if not exists effective_planted_on date;
alter table sub_plots
  add column if not exists effective_planted_on date;

comment on column crop_cycles.effective_planted_on is
  'Where this cycle sits on the protocol, as the date it would have been '
  'planted to be at its observed growth stage. Falls back to date_planted, '
  'then date_started. A block overrides its cycle.';

-- ---------------------------------------------------------------------------
-- What has been accepted, skipped, or done
-- ---------------------------------------------------------------------------
-- One row the first time an activity is answered for a block. Nothing is
-- scheduled automatically: the farm manager accepts it from the plot page.

create table if not exists protocol_plan (
  id            uuid primary key default gen_random_uuid(),
  cycle_id      uuid not null references crop_cycles(id) on delete cascade,
  sub_plot_id   uuid references sub_plots(id) on delete cascade,
  activity_code text not null references protocol_activities(code),

  -- scheduled | skipped | done
  state         text not null check (state in ('scheduled', 'skipped', 'done')),
  due_on        date,
  done_on       date,

  /*
   * Why it was skipped. "already_done" back-dates work nobody logged, which
   * is how three months of unprotocolled history gets reconciled without a
   * data-entry chore; "superseded" is written by the app when a later round
   * of the same series closes this one, and is the farm's record that the
   * plant missed a round rather than a sign that nothing happened.
   */
  skip_reason   text check (skip_reason in
                  ('already_done', 'not_needed', 'no_material', 'too_late', 'superseded')),
  note          text,
  -- The plants this was planned for, so a later recount does not rewrite
  -- what was actually mixed and carried out to the field.
  plants        integer check (plants >= 0),

  created_at    timestamptz not null default now(),
  created_by    text references app_users(email),
  unique nulls not distinct (cycle_id, sub_plot_id, activity_code)
);

create index if not exists protocol_plan_by_cycle on protocol_plan (cycle_id, state);
create index if not exists protocol_plan_due on protocol_plan (due_on) where state = 'scheduled';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- The catalogues are reference data: owners change them, everyone reads them.
-- The plan is the farm manager's working list, so he writes it.
do $$
declare t text;
begin
  foreach t in array array['materials', 'protocol_activities', 'protocol_activity_materials']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on table %I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table %I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant select, insert, update, delete on table %I to authenticated', t);
    end if;
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (is_allowed())', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format(
      'create policy %I on %I for all using (is_owner()) with check (is_owner())',
      t || '_write', t);
  end loop;
end $$;

do $$
begin
  alter table protocol_plan enable row level security;
  alter table protocol_plan force row level security;
  revoke all on table protocol_plan from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table protocol_plan from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on table protocol_plan to authenticated;
  end if;
  drop policy if exists protocol_plan_read on protocol_plan;
  create policy protocol_plan_read on protocol_plan for select using (is_allowed());
  drop policy if exists protocol_plan_write on protocol_plan;
  create policy protocol_plan_write on protocol_plan
    for all using (is_allowed()) with check (is_allowed());
end $$;
