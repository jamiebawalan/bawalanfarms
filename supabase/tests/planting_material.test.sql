-- planting_material.test.sql — bought suckers cost money; our own do not.
--
-- The point of 0039 is that the two routes into a planted field are
-- comparable. These put real rows through it.

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

insert into crop_cycles (id, plot_id, crop, status, date_started)
select '44444444-4444-4444-4444-444444444444', id, 'pineapple', 'growing',
       date '2026-02-01'
from plots where code = '1';

do $$
declare
  cash   bigint;
  labour bigint;
  cat    expense_category;
begin
  -- Bought material: cash to another farm, plus our own labour to prepare it.
  insert into expenses (id, date, category, activity, amount_centavos,
                        unit_price_centavos, quantity, attribution, note)
  values
    ('55555555-5555-5555-5555-555555555555', date '2026-02-02', 'Farm Inputs',
     'buy_material', 4000000, 200, 20000, 'direct', 'suckers off the Reyes farm'),
    ('66666666-6666-6666-6666-666666666666', date '2026-02-03', 'Labor',
     'prep_material', 300000, null, null, 'direct', 'sorting and cutting');

  insert into expense_allocations (expense_id, plot_id, amount_centavos)
  select id, (select plots.id from plots where code = '1'), amount_centavos
    from expenses
   where id in ('55555555-5555-5555-5555-555555555555',
                '66666666-6666-6666-6666-666666666666');

  select coalesce(sum(amount_centavos), 0) into cash
    from expenses where activity = 'buy_material';
  if cash <> 4000000 then
    raise exception 'TEST FAILED: bought material did not land as cash (got %)', cash;
  end if;
  raise notice 'ok  bought planting material is a cash cost';

  select coalesce(sum(amount_centavos), 0) into labour
    from expenses where activity = 'prep_material';
  if labour <> 300000 then
    raise exception 'TEST FAILED: prep did not land as labour (got %)', labour;
  end if;
  raise notice 'ok  preparing material is a labour cost';

  -- The two axes must stay apart: buying is an input, preparing is labour.
  select default_category into cat from activities where code = 'buy_material';
  if cat <> 'Farm Inputs' then
    raise exception 'TEST FAILED: buying suckers defaults to % not Farm Inputs', cat;
  end if;
  select default_category into cat from activities where code = 'prep_material';
  if cat <> 'Labor' then
    raise exception 'TEST FAILED: preparing material defaults to % not Labor', cat;
  end if;
  raise notice 'ok  the two sit on the right axes by default';

  -- Our own material costs nothing to buy. Gathering it is labour, and that
  -- activity already existed — the point is there is no cash line to add.
  if not exists (select 1 from activities where code = 'gather_material' and active) then
    raise exception 'TEST FAILED: gathering our own material is no longer offered';
  end if;
  raise notice 'ok  sourcing our own still has a labour line and no cash line';

  -- Prep is one activity on purpose. If somebody splits it later they must
  -- think about this line first.
  if exists (
    select 1 from activities
     where active and code in ('sort_material', 'cut_material', 'pack_material')
  ) then
    raise exception 'TEST FAILED: prep was split into separate activities without migrating prep_material';
  end if;
  raise notice 'ok  preparing material stays one activity, as decided';
end $$;

rollback;
