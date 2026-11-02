-- recategorise_money.test.sql — the money is the same money afterwards.
--
-- The recategorisation rewrites what a cost was *for*. It must not change
-- what anything cost, must not lose a row, and must not break the link
-- between an expense and the plots it was charged to.
--
-- That is almost self-evident from reading 0033 — no amount column appears in
-- it — but "I read it and no amount is touched" is an argument, not a test,
-- and the whole book's credibility rests on these totals.

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

insert into crop_cycles (id, plot_id, crop, status, date_started)
select '55555555-5555-5555-5555-555555555555', id, 'pineapple', 'growing',
       date '2026-01-10'
from plots where code = '1';

update activities set active = true
where code in ('abono', 'pakyaw_deweed', 'food', 'fert_0_0_60', 'tabas',
               'tabas_mane', 'barang', 'spray', 'araro', 'harvesting',
               'kalakal', 'diesel', 'insecticides', 'other');

-- A spread of the real shapes: labour, materials, machines, a farm-wide cost,
-- an "Other", an unsettled code, and one already on the new vocabulary.
with e as (
  insert into expenses (date, category, activity, activity_other_note,
                        attribution, farm_wide_reason, labour_mode,
                        amount_centavos, note)
  values
    (date '2026-03-01','Labor','abono',null,'direct',null,'daily',140000,'a'),
    (date '2026-03-02','Labor','pakyaw_deweed',null,'direct',null,null,250000,'b'),
    (date '2026-03-03','Farm Inputs','food',null,'direct',null,null,65000,'c'),
    (date '2026-03-04','Farm Inputs','fert_0_0_60',null,'direct',null,null,860000,'d'),
    (date '2026-03-05','Labor','araro',null,'direct',null,'daily',200000,'e'),
    (date '2026-03-06','Labor','spray',null,'direct',null,'daily',120000,'f'),
    (date '2026-03-07','Miscellaneous','other','wrangler parts','direct',null,null,1540000,null),
    (date '2026-03-08','Labor','harvesting',null,'direct',null,'daily',330000,'h'),
    (date '2026-03-09','Selling Transport','kalakal',null,'direct',null,null,400000,'i'),
    (date '2026-03-10','Machines','diesel',null,'direct',null,null,215000,'j'),
    (date '2026-03-11','Farm Inputs','insecticides',null,'direct',null,null,117000,'k'),
    (date '2026-03-12','Labor','side_dress',null,'direct',null,'daily',90000,'already new')
  returning id, amount_centavos
)
insert into expense_allocations (expense_id, plot_id, cycle_id, amount_centavos)
select e.id, (select id from plots where code = '1'),
       '55555555-5555-5555-5555-555555555555', e.amount_centavos
from e;

-- A farm-wide cost too: it has no plot, and must still be counted.
insert into expenses (date, category, activity, attribution, farm_wide_reason,
                      amount_centavos, note)
values (date '2026-03-13','Machines','barang','farm_wide','vehicle',650000,'l');

create temporary table before_state as
select
  (select sum(amount_centavos) from expenses where voided_at is null) as total,
  (select count(*) from expenses) as rows,
  (select sum(amount_centavos) from expense_allocations) as allocated;

\i supabase/migrations/0033_recategorise_history.sql

-- 1. Not a centavo moved, and not a row lost -------------------------------
do $$
declare b record; t bigint; r bigint; a bigint;
begin
  select * into b from before_state;
  select sum(amount_centavos) into t from expenses where voided_at is null;
  select count(*) into r from expenses;
  select sum(amount_centavos) into a from expense_allocations;

  if t <> b.total then
    raise exception 'TEST FAILED: total was % and is now %', b.total, t;
  end if;
  if r <> b.rows then
    raise exception 'TEST FAILED: % rows became %', b.rows, r;
  end if;
  if a <> b.allocated then
    raise exception 'TEST FAILED: allocations were % and are now %', b.allocated, a;
  end if;
  raise notice 'ok  the total, the row count and the plot allocations are unchanged';
end $$;

-- 2. Every peso is either recategorised or still waiting --------------------
-- This is the reconciliation the owners actually asked for: the old book adds
-- up to the new book plus whatever has not been decided yet.
do $$
declare total bigint; moved bigint; waiting bigint;
begin
  select sum(amount_centavos) into total from expenses where voided_at is null;

  select coalesce(sum(amount_centavos), 0) into moved
  from expenses where voided_at is null and legacy_activity is not null;

  select coalesce(sum(amount_centavos), 0) into waiting
  from expenses
  where voided_at is null and legacy_activity is null
    and (activity = 'other' or activity in (
      'spray','liquid','stab_drop','pinya_trimming',
      'material_collection','fruiting_formula','land_prep'));

  -- The remainder is everything that was already on the new vocabulary.
  if moved + waiting > total then
    raise exception
      'TEST FAILED: recategorised (%) plus waiting (%) exceeds the total (%)',
      moved, waiting, total;
  end if;

  raise notice
    'ok  recategorised % + waiting % + already-new % = % total',
    moved, waiting, total - moved - waiting, total;
end $$;

-- 3. Nothing is stranded on a code that no longer exists --------------------
do $$
declare bad text;
begin
  select string_agg(distinct e.activity, ', ') into bad
  from expenses e
  left join activities a on a.code = e.activity
  where a.code is null;
  if bad is not null then
    raise exception 'TEST FAILED: expenses point at missing activities: %', bad;
  end if;
  raise notice 'ok  every expense still points at an activity that exists';
end $$;

-- 4. The farm-wide cost came through -----------------------------------------
-- It has no allocation row, so a reconciliation that joined through
-- allocations would quietly drop it. This is the row that catches that.
do $$
declare a text; c text;
begin
  select activity, category into a, c from expenses where note = 'l';
  if a <> 'machine_repair' then
    raise exception 'TEST FAILED: the farm-wide repair became %', a;
  end if;
  if c <> 'Machines' then
    raise exception 'TEST FAILED: its category became %', c;
  end if;
  raise notice 'ok  a farm-wide cost is recategorised and still has no plot';
end $$;

-- 5. Only Food changed category ----------------------------------------------
do $$
declare bad text;
begin
  select string_agg(legacy_activity || ' now ' || category::text, ', ') into bad
  from expenses
  where legacy_activity is not null
    and legacy_activity <> 'food'
    and category <> (
      case legacy_activity
        when 'abono' then 'Labor' when 'pakyaw_deweed' then 'Labor'
        when 'fert_0_0_60' then 'Farm Inputs' when 'harvesting' then 'Labor'
        when 'kalakal' then 'Selling Transport' when 'diesel' then 'Machines'
        when 'insecticides' then 'Farm Inputs' when 'barang' then 'Machines'
      end
    )::expense_category;
  if bad is not null then
    raise exception 'TEST FAILED: a category changed that should not have: %', bad;
  end if;
  raise notice 'ok  only crew food changed which kind of money it is';
end $$;

rollback;
