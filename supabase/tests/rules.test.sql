-- rules.test.sql — proves the database refuses the things that corrupted the
-- old spreadsheet. Run with: ./scripts/db-test.sh

\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function assert_rejects(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
    -- Deferred constraint triggers only fire at commit, so force them now.
    set constraints all immediate;
    raise exception 'TEST FAILED: % was accepted but should have been rejected', label;
  exception
    when others then
      if sqlerrm like 'TEST FAILED%' then raise; end if;
      raise notice 'ok  %', label;
  end;
  set constraints all deferred;
end;
$$;

create or replace function assert_accepts(stmt text, label text)
returns void language plpgsql as $$
begin
  execute stmt;
  set constraints all immediate;
  raise notice 'ok  %', label;
  set constraints all deferred;
end;
$$;

begin;
set constraints all deferred;

-- Fixtures ------------------------------------------------------------------
insert into app_users (email, role, display_name)
  values ('owner@example.com','owner','Owner');

create temp table ids as
select
  (select id from plots where code = '1')  as plot1,
  (select id from plots where code = '2')  as plot2,
  (select id from plots where code = '3')  as plot3;

insert into crop_cycles (id, plot_id, crop, status, date_started, date_planted)
select '11111111-1111-1111-1111-111111111111', plot1, 'pineapple', 'growing',
       date '2024-01-10', date '2024-02-01' from ids;

-- 1. One live cycle per plot ------------------------------------------------
select assert_rejects($$
  insert into crop_cycles (plot_id, crop, status, date_started)
  select plot1, 'peanut', 'land_prep', current_date from ids $$,
  'a plot cannot carry two live cycles');

-- 2. ...but one planned cycle may queue behind it (peanuts out, pineapple in)
select assert_accepts($$
  insert into crop_cycles (plot_id, crop, status)
  select plot1, 'pineapple', 'planned' from ids $$,
  'a planned cycle may queue behind a live one');

select assert_rejects($$
  insert into crop_cycles (plot_id, crop, status)
  select plot1, 'corn', 'planned' from ids $$,
  'only one planned cycle may queue per plot');

-- 3. Expense attribution shapes ---------------------------------------------
select assert_rejects($$
  with e as (
    insert into expenses (date, category, activity, attribution, amount_centavos)
    values (current_date, 'Labor', 'deweed', 'direct', 50000) returning id)
  insert into expense_allocations (expense_id, plot_id, amount_centavos)
  select e.id, i.plot1, 25000 from e, ids i
  union all select e.id, i.plot2, 25000 from e, ids i $$,
  'a direct expense cannot name two plots');

select assert_rejects($$
  with e as (
    insert into expenses (date, category, activity, attribution, amount_centavos)
    values (current_date, 'Labor', 'deweed', 'split', 50000) returning id)
  insert into expense_allocations (expense_id, plot_id, amount_centavos)
  select e.id, i.plot1, 50000 from e, ids i $$,
  'a split expense cannot name only one plot');

select assert_rejects($$
  with e as (
    insert into expenses (date, category, activity, attribution, amount_centavos)
    values (current_date, 'Labor', 'deweed', 'split', 50000) returning id)
  insert into expense_allocations (expense_id, plot_id, amount_centavos)
  select e.id, i.plot1, 20000 from e, ids i
  union all select e.id, i.plot2, 20000 from e, ids i $$,
  'a split must add up to the amount entered, to the centavo');

select assert_rejects($$
  with e as (
    insert into expenses (date, category, activity, attribution, farm_wide_reason, amount_centavos)
    values (current_date, 'Machines', 'barang', 'farm_wide', 'vehicle', 50000) returning id)
  insert into expense_allocations (expense_id, plot_id, amount_centavos)
  select e.id, i.plot1, 50000 from e, ids i $$,
  'a farm-wide expense cannot name plots');

-- 4. Rule 5: blank plot is not an accident state -----------------------------
select assert_rejects($$
  insert into expenses (date, category, activity, attribution, amount_centavos)
  values (current_date, 'Machines', 'barang', 'farm_wide', 50000) $$,
  'farm-wide demands a stated reason');

-- 5. Rule 2: the vocabulary escape hatch demands a note ----------------------
select assert_rejects($$
  with e as (
    insert into expenses (date, category, activity, attribution, amount_centavos)
    values (current_date, 'Miscellaneous', 'other', 'direct', 50000) returning id)
  insert into expense_allocations (expense_id, plot_id, amount_centavos)
  select e.id, i.plot1, 50000 from e, ids i $$,
  '"other" activity demands a note');

-- 6. Rule 7: amounts are computed, never typed twice -------------------------
select assert_rejects($$
  with e as (
    insert into expenses (date, category, activity, attribution,
                          unit_price_centavos, quantity, amount_centavos)
    values (current_date, 'Labor', 'deweed', 'direct', 45000, 3, 100000) returning id)
  insert into expense_allocations (expense_id, plot_id, amount_centavos)
  select e.id, i.plot1, 100000 from e, ids i $$,
  'amount must equal unit price x quantity');

-- 7. Rule 6: nine rows in the old book were dated a year late -----------------
select assert_rejects($$
  insert into expenses (date, category, activity, attribution, farm_wide_reason, amount_centavos)
  values (current_date + 400, 'Machines', 'barang', 'farm_wide', 'vehicle', 50000) $$,
  'a date a year out is refused at the storage layer');

-- 8. Labour mode belongs to labour only --------------------------------------
select assert_rejects($$
  insert into expenses (date, category, activity, attribution, farm_wide_reason,
                        labour_mode, amount_centavos)
  values (current_date, 'Machines', 'diesel', 'farm_wide', 'vehicle', 'daily', 50000) $$,
  'labour mode cannot attach to a non-labour cost');

-- 9. Input stock cannot go negative ------------------------------------------
insert into input_purchases (id, date, input_type, quantity, unit,
                             unit_cost_centavos, total_centavos, supplier)
values ('22222222-2222-2222-2222-222222222222', date '2024-03-01', 'fert_21_0_0',
        250, 'sack', 110000, 27500000, 'Bulk lot');

select assert_accepts($$
  insert into input_draws (purchase_id, cycle_id, date, quantity)
  values ('22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111', date '2024-03-05', 209) $$,
  'drawing 209 of 250 sacks is allowed');

select assert_rejects($$
  insert into input_draws (purchase_id, cycle_id, date, quantity)
  values ('22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111', date '2024-03-06', 42) $$,
  'drawing 42 more from a lot holding 41 is refused');

-- 10. Closing a cycle freezes its ledger --------------------------------------
insert into crop_cycles (id, plot_id, crop, status, date_started, date_closed)
select '33333333-3333-3333-3333-333333333333', plot2, 'peanut', 'closed',
       date '2023-01-01', date '2023-08-01' from ids;

select assert_rejects($$
  insert into harvests (cycle_id, date) values
    ('33333333-3333-3333-3333-333333333333', current_date) $$,
  'a closed cycle accepts no new harvest');

-- ...unless the historical import is running, which must backdate onto
-- cycles that closed years ago.
select set_config('farm.importing', 'on', true);
select assert_accepts($$
  insert into harvests (cycle_id, date) values
    ('33333333-3333-3333-3333-333333333333', date '2023-07-01') $$,
  'the import may write onto a closed cycle');
select set_config('farm.importing', 'off', true);

-- 11. cycle_for_plot_on picks the cycle live on that date ---------------------
do $$
declare got uuid;
begin
  select cycle_for_plot_on((select plot1 from ids), date '2024-06-01') into got;
  if got is distinct from '11111111-1111-1111-1111-111111111111' then
    raise exception 'TEST FAILED: expected the growing cycle, got %', got;
  end if;
  select cycle_for_plot_on((select plot2 from ids), date '2023-05-01') into got;
  if got is distinct from '33333333-3333-3333-3333-333333333333' then
    raise exception 'TEST FAILED: expected the closed 2023 cycle, got %', got;
  end if;
  -- After that cycle closed, the plot carried nothing.
  select cycle_for_plot_on((select plot2 from ids), date '2023-12-01') into got;
  if got is not null then
    raise exception 'TEST FAILED: expected no cycle, got %', got;
  end if;
  raise notice 'ok  cycle_for_plot_on resolves the cycle live on a given date';
end $$;

-- 12. plot_area_on respects effective dating ----------------------------------
do $$
declare a numeric;
begin
  select plot_area_on((select plot1 from ids), current_date) into a;
  if a <> 7056 then raise exception 'TEST FAILED: plot 1 area was %', a; end if;
  -- The coffee plot has no surveyed area yet, and must report that honestly
  -- rather than defaulting to zero and silently skewing every split.
  select plot_area_on((select id from plots where code='27'), current_date) into a;
  if a is not null then raise exception 'TEST FAILED: coffee area was %', a; end if;
  raise notice 'ok  areas are effective-dated, and an unsurveyed plot reads null';
end $$;

-- 13. A good expense still gets through ---------------------------------------
select assert_accepts($$
  with e as (
    insert into expenses (date, category, activity, attribution, labour_mode,
                          unit_price_centavos, quantity, amount_centavos)
    values (current_date, 'Labor', 'deweed', 'split', 'daily', 45000, 4, 180000)
    returning id)
  insert into expense_allocations (expense_id, plot_id, cycle_id, amount_centavos)
  select e.id, i.plot1, '11111111-1111-1111-1111-111111111111'::uuid, 100000 from e, ids i
  union all select e.id, i.plot3, null::uuid, 80000 from e, ids i $$,
  'a well-formed split expense saves');

rollback;
