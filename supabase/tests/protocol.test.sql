-- protocol.test.sql — the protocol tables hold what the protocol says.
--
-- The seed is transcribed from a document by hand, so these check the
-- transcription itself as much as the schema: a dose on the wrong basis is
-- not a bug that shows up as an error, it shows up as a wasted sack of urea.

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

-- 1. The three per-area exceptions are per area -------------------------------
-- The protocol is explicit that lime, dolomite, rock phosphate, herbicides and
-- land prep are never scaled by plant count. This is the single most expensive
-- thing in the file to get wrong.
do $$
declare bad text;
begin
  select string_agg(distinct a.code, ', ') into bad
  from protocol_activities a
  join protocol_activity_materials m on m.activity_code = a.code
  join materials mat on mat.code = m.material_code
  where mat.kind in ('herbicide', 'amendment')
    and (a.basis <> 'per_area' or m.qty_unit = 'g_per_plant');
  if bad is not null then
    raise exception 'TEST FAILED: dosed per plant but must be per area: %', bad;
  end if;
  raise notice 'ok  herbicides and soil amendments are dosed per area, never per plant';
end $$;

-- 2. A per-plant activity never carries a per-area dose, and vice versa -------
do $$
declare bad text;
begin
  select string_agg(a.code || '/' || m.qty_unit, ', ') into bad
  from protocol_activities a
  join protocol_activity_materials m on m.activity_code = a.code
  where (a.basis = 'per_plant' and m.qty_unit <> 'g_per_plant')
     or (a.basis = 'per_area' and m.qty_unit = 'g_per_plant');
  if bad is not null then
    raise exception 'TEST FAILED: dose unit contradicts the activity basis: %', bad;
  end if;
  raise notice 'ok  every dose unit agrees with its activity basis';
end $$;

-- 3. Nothing consumes a material on basis "none" ------------------------------
do $$
declare bad text;
begin
  select string_agg(distinct a.code, ', ') into bad
  from protocol_activities a
  join protocol_activity_materials m on m.activity_code = a.code
  where a.basis = 'none';
  if bad is not null then
    raise exception 'TEST FAILED: consumes materials but has no dosing basis: %', bad;
  end if;
  raise notice 'ok  an activity that consumes nothing claims no basis';
end $$;

-- 4. Every choice group has exactly one default -------------------------------
-- The farm manager cannot read a soil test, so a choice is shown with its
-- default pre-selected. Two defaults or none makes that screen a guess.
do $$
declare bad text;
begin
  select string_agg(choice_group || ' (' || n || ')', ', ') into bad
  from (
    select choice_group, count(*) filter (where is_default) as n
    from protocol_activities where choice_group is not null
    group by choice_group
  ) g where n <> 1;
  if bad is not null then
    raise exception 'TEST FAILED: choice groups without exactly one default: %', bad;
  end if;
  raise notice 'ok  every choice has exactly one default';
end $$;

-- 5. Diuron goes on once per cycle, and only at planting ----------------------
-- It burns young pineapple. A second round would be a plot of scorched plants.
do $$
declare months numeric[];
begin
  select array_agg(distinct a.map_month order by a.map_month) into months
  from protocol_activities a
  join protocol_activity_materials m on m.activity_code = a.code
  where m.material_code = 'diuron';
  if months <> array[0]::numeric[] then
    raise exception 'TEST FAILED: diuron scheduled at months %', months;
  end if;
  raise notice 'ok  diuron appears only at planting';
end $$;

-- 6. Boron is the one round the protocol says it is ---------------------------
do $$
declare n integer;
begin
  select count(*) into n from protocol_activity_materials where material_code = 'solubor';
  if n <> 1 then raise exception 'TEST FAILED: % boron rounds, expected 1', n; end if;
  raise notice 'ok  boron goes on once in the crop';
end $$;

-- 7. Urea is last into the tank -----------------------------------------------
-- Dissolving it early burns the mix. The order is in the data, not a habit.
do $$
declare bad text;
begin
  select string_agg(activity_code, ', ') into bad
  from protocol_activity_materials m
  where m.mix_order is not null
    and m.material_code <> 'urea'
    and m.mix_order >= (
      select mix_order from protocol_activity_materials u
      where u.activity_code = m.activity_code and u.material_code = 'urea'
    );
  if bad is not null then
    raise exception 'TEST FAILED: something mixes at or after urea in: %', bad;
  end if;
  raise notice 'ok  urea is last into every tank it goes into';
end $$;

-- 8. Rounds of a series are distinct months -----------------------------------
-- Two rounds of one programme in the same month would show as two jobs and
-- close each other at random.
do $$
declare bad text;
begin
  select string_agg(series || ' @ ' || map_month, ', ') into bad
  from (
    select series, map_month from protocol_activities
    where series is not null
    group by series, map_month having count(*) > 1
  ) d;
  if bad is not null then
    raise exception 'TEST FAILED: two rounds of one series in one month: %', bad;
  end if;
  raise notice 'ok  each series has at most one round per month';
end $$;

-- 9. The plan treats a whole-plot answer as one row ---------------------------
-- sub_plot_id is null for an unblocked plot. Without "nulls not distinct" the
-- unique index would let the same activity be answered twice.
do $$
declare cyc uuid;
begin
  select '22222222-2222-2222-2222-222222222222'::uuid into cyc;
  insert into crop_cycles (id, plot_id, crop, status, date_started)
  select cyc, id, 'pineapple', 'growing', date '2026-01-10' from plots where code = '1';

  insert into protocol_plan (cycle_id, activity_code, state)
  values (cyc, 'foliar_5', 'done');
  begin
    insert into protocol_plan (cycle_id, activity_code, state)
    values (cyc, 'foliar_5', 'skipped');
    raise exception 'TEST FAILED: answered the same activity twice on one plot';
  exception when unique_violation then
    null;
  end;
  raise notice 'ok  a whole-plot activity can only be answered once';
end $$;

-- 10. A skip reason has to be one the app writes ------------------------------
do $$
begin
  begin
    insert into protocol_plan (cycle_id, activity_code, state, skip_reason)
    values ('22222222-2222-2222-2222-222222222222', 'foliar_6', 'skipped', 'because');
    raise exception 'TEST FAILED: accepted a skip reason nothing can read';
  exception when check_violation then
    null;
  end;
  raise notice 'ok  skip reasons are a closed list';
end $$;

-- 11. Effective planting dates exist on both the cycle and the block ----------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'crop_cycles' and column_name = 'effective_planted_on'
  ) then raise exception 'TEST FAILED: crop_cycles has no effective_planted_on'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'sub_plots' and column_name = 'effective_planted_on'
  ) then raise exception 'TEST FAILED: sub_plots has no effective_planted_on'; end if;
  raise notice 'ok  a block can sit on the protocol independently of its cycle';
end $$;

-- 12. Forcing comes after the readiness check ---------------------------------
do $$
declare check_at numeric; force_at numeric;
begin
  select map_month into check_at from protocol_activities where code = 'forcing_check';
  select map_month into force_at from protocol_activities where code = 'forcing';
  if check_at is null or force_at is null or check_at >= force_at then
    raise exception 'TEST FAILED: readiness check at %, forcing at %', check_at, force_at;
  end if;
  raise notice 'ok  the plot is weighed before it is forced';
end $$;

rollback;
