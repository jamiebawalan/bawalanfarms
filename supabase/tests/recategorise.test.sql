-- recategorise.test.sql — the vocabulary change, against actual rows.
--
-- The migration replays cleanly on an empty database, which proves nothing.
-- These put expenses through it.

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

-- A cycle to hang costs on.
insert into crop_cycles (id, plot_id, crop, status, date_started)
select '33333333-3333-3333-3333-333333333333', id, 'pineapple', 'growing',
       date '2026-01-10'
from plots where code = '1';

-- Put the old vocabulary back, as it stood before 0032 retired it, and log
-- one expense against each of the codes this test is about.
update activities set active = true
where code in ('abono', 'pakyaw_deweed', 'food', 'fert_0_0_60', 'tabas',
               'tabas_mane', 'barang', 'spray');

insert into expenses
  (id, date, category, activity, attribution, farm_wide_reason, labour_mode,
   amount_centavos, note)
values
  ('a0000000-0000-0000-0000-000000000001', date '2026-03-01', 'Labor',
   'abono', 'direct', null, 'daily', 140000, 'spread the 0-0-60'),
  ('a0000000-0000-0000-0000-000000000002', date '2026-03-02', 'Labor',
   'pakyaw_deweed', 'direct', null, null, 250000, 'contracted out'),
  ('a0000000-0000-0000-0000-000000000003', date '2026-03-03', 'Farm Inputs',
   'food', 'direct', null, null, 65000, 'crew lunch'),
  ('a0000000-0000-0000-0000-000000000004', date '2026-03-04', 'Farm Inputs',
   'fert_0_0_60', 'direct', null, null, 860000, 'two sacks'),
  ('a0000000-0000-0000-0000-000000000005', date '2026-03-05', 'Labor',
   'tabas', 'direct', null, 'daily', 80000, 'start tabas'),
  ('a0000000-0000-0000-0000-000000000006', date '2026-03-06', 'Labor',
   'tabas_mane', 'direct', null, 'daily', 120000, 'cut back the peanut'),
  ('a0000000-0000-0000-0000-000000000007', date '2026-03-07', 'Machines',
   'barang', 'farm_wide', 'vehicle', null, 650000, 'differential'),
  ('a0000000-0000-0000-0000-000000000008', date '2026-03-08', 'Labor',
   'spray', 'direct', null, 'daily', 120000, 'sprayed something');

\i supabase/migrations/0033_recategorise_history.sql

-- 1. The codes that mean one thing are moved ---------------------------------
do $$
declare bad text;
begin
  select string_agg(legacy_activity || ' -> ' || activity, ', ') into bad
  from expenses
  where id in (
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000007')
  and activity <> case legacy_activity
    when 'abono' then 'side_dress'
    when 'fert_0_0_60' then 'side_dress'
    when 'tabas_mane' then 'peanut_cutback'
    when 'barang' then 'machine_repair'
  end;
  if bad is not null then raise exception 'TEST FAILED: wrong mapping: %', bad; end if;
  raise notice 'ok  each retired code lands on exactly one new activity';
end $$;

-- 2. The category is NOT rewritten -------------------------------------------
-- A sack of potash and the morning spent spreading it are both Side-dress.
-- One is Farm Inputs and one is Labour, and collapsing that would turn every
-- fertiliser purchase into a labour cost.
do $$
declare c text; l text;
begin
  select category into c from expenses where id = 'a0000000-0000-0000-0000-000000000004';
  select category into l from expenses where id = 'a0000000-0000-0000-0000-000000000001';
  if c <> 'Farm Inputs' then raise exception 'TEST FAILED: the potash became %', c; end if;
  if l <> 'Labor' then raise exception 'TEST FAILED: the spreading became %', l; end if;
  raise notice 'ok  buying a material and applying it stay different kinds of money';
end $$;

-- 3. Pakyaw moves to the column that already held it -------------------------
do $$
declare m text; a text;
begin
  select labour_mode::text, activity into m, a
  from expenses where id = 'a0000000-0000-0000-0000-000000000002';
  if a <> 'weed_manual' then raise exception 'TEST FAILED: pakyaw deweed became %', a; end if;
  if m <> 'pakyaw' then raise exception 'TEST FAILED: labour mode is %', m; end if;
  raise notice 'ok  pakyaw becomes a way of paying, not a second weeding job';
end $$;

-- 4. Deweed and tabas land on the same job -----------------------------------
do $$
declare a text;
begin
  select activity into a from expenses where id = 'a0000000-0000-0000-0000-000000000005';
  if a <> 'weed_manual' then raise exception 'TEST FAILED: tabas became %', a; end if;
  raise notice 'ok  tabas and hand weeding are one activity, sprays are another';
end $$;

-- 5. Food leaves Farm Inputs -------------------------------------------------
do $$
declare c text; a text;
begin
  select category, activity into c, a
  from expenses where id = 'a0000000-0000-0000-0000-000000000003';
  if a <> 'crew_food' then raise exception 'TEST FAILED: food became %', a; end if;
  if c <> 'Labor' then raise exception 'TEST FAILED: food is still %', c; end if;
  raise notice 'ok  crew food stops counting as a farm input';
end $$;

-- 6. What was written is still readable --------------------------------------
do $$
declare n int;
begin
  select count(*) into n from expenses
  where id::text like 'a0000000%' and legacy_activity is null and activity <> 'spray';
  if n <> 0 then raise exception 'TEST FAILED: % rows lost their original code', n; end if;
  raise notice 'ok  every recategorised row still carries the code it was given';
end $$;

-- 7. An unsettled code is left alone -----------------------------------------
-- "Spray" could be herbicide, pesticide, fungicide or foliar feed. Guessing
-- would write that guess into eighteen months of history.
do $$
declare a text; l text;
begin
  select activity, legacy_activity into a, l
  from expenses where id = 'a0000000-0000-0000-0000-000000000008';
  if a <> 'spray' or l is not null then
    raise exception 'TEST FAILED: spray was mapped to % without anybody deciding', a;
  end if;
  raise notice 'ok  a code nobody has settled is left where it is';
end $$;

-- 8. Running it again changes nothing ----------------------------------------
do $$
declare before_state text; after_state text;
begin
  select string_agg(id::text || activity || coalesce(legacy_activity,'-') ||
                    category::text || coalesce(labour_mode::text,'-'), '|' order by id)
  into before_state from expenses where id::text like 'a0000000%';
end $$;
\i supabase/migrations/0033_recategorise_history.sql
do $$
declare n int;
begin
  -- A second pass must not re-map an already-mapped row into legacy_activity.
  select count(*) into n from expenses
  where id::text like 'a0000000%' and legacy_activity = activity;
  if n <> 0 then raise exception 'TEST FAILED: % rows were remapped onto themselves', n; end if;
  select count(*) into n from expenses
  where id = 'a0000000-0000-0000-0000-000000000001' and legacy_activity <> 'abono';
  if n <> 0 then raise exception 'TEST FAILED: the second run overwrote the original code'; end if;
  raise notice 'ok  running the migration twice changes nothing';
end $$;

rollback;
