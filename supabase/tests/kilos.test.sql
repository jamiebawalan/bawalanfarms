-- kilos.test.sql — fertiliser changes unit without changing money.
--
-- The conversion restates every sack purchase and every draw against it. The
-- one thing that must not move is the money: 5 sacks at ₱1,100 and 250 kg at
-- ₱22 are the same ₱5,500, and the plot that used it must be charged the same
-- afterwards as before.

\set ON_ERROR_STOP on
set client_min_messages to notice;

begin;

insert into crop_cycles (id, plot_id, crop, status, date_started)
select '77777777-7777-7777-7777-777777777777', id, 'pineapple', 'growing',
       date '2026-01-10'
from plots where code = '1';

-- Put the sacks back, as they stood before 0036.
update input_types set unit = 'sack', kg_per_unit = 50
where code in ('urea', 'dap', 'fert_0_0_60');

insert into input_purchases
  (id, date, input_type, quantity, unit, unit_cost_centavos, total_centavos)
values
  -- A whole-peso price, which is the ordinary case.
  ('b0000000-0000-0000-0000-000000000001', date '2026-02-01', 'urea',
   5, 'sack', 110000, 550000),
  -- A price with centavos that still divides: ₱1,105.50 a sack.
  ('b0000000-0000-0000-0000-000000000002', date '2026-02-02', 'dap',
   2, 'sack', 110550, 221100),
  -- Something already in kilos, which must not be touched.
  ('b0000000-0000-0000-0000-000000000003', date '2026-02-03', 'zinc_sulfate',
   4, 'kg', 50000, 200000);

insert into input_draws (purchase_id, cycle_id, date, quantity) values
  ('b0000000-0000-0000-0000-000000000001',
   '77777777-7777-7777-7777-777777777777', date '2026-03-01', 1.5),
  ('b0000000-0000-0000-0000-000000000003',
   '77777777-7777-7777-7777-777777777777', date '2026-03-02', 0.5);

create temporary table before_kilos as
select
  (select sum(total_centavos) from input_purchases) as stock_value,
  (select sum(round(p.unit_cost_centavos * d.quantity))
     from input_draws d join input_purchases p on p.id = d.purchase_id) as drawn_cost;

\i supabase/migrations/0036_fertiliser_in_kilos.sql

-- 1. Not a centavo moved -----------------------------------------------------
do $$
declare b record; v bigint; c bigint;
begin
  select * into b from before_kilos;
  select sum(total_centavos) into v from input_purchases;
  select sum(round(p.unit_cost_centavos * d.quantity)) into c
  from input_draws d join input_purchases p on p.id = d.purchase_id;

  if v <> b.stock_value then
    raise exception 'TEST FAILED: stock was worth % and is now %', b.stock_value, v;
  end if;
  if c <> b.drawn_cost then
    raise exception 'TEST FAILED: drawn cost was % and is now %', b.drawn_cost, c;
  end if;
  raise notice 'ok  the value of the stock and the cost already drawn are unchanged';
end $$;

-- 2. The quantities are fifty times, in kilos --------------------------------
do $$
declare q numeric; u text; c bigint;
begin
  select quantity, unit, unit_cost_centavos into q, u, c
  from input_purchases where id = 'b0000000-0000-0000-0000-000000000001';
  if q <> 250 then raise exception 'TEST FAILED: 5 sacks became %', q; end if;
  if u <> 'kg' then raise exception 'TEST FAILED: the unit is %', u; end if;
  if c <> 2200 then raise exception 'TEST FAILED: per kilo is %', c; end if;
  raise notice 'ok  5 sacks at 1,100 is 250 kg at 22';
end $$;

-- 3. A price with centavos converts too --------------------------------------
do $$
declare c bigint; t bigint;
begin
  select unit_cost_centavos, total_centavos into c, t
  from input_purchases where id = 'b0000000-0000-0000-0000-000000000002';
  if c <> 2211 then raise exception 'TEST FAILED: per kilo is %', c; end if;
  if t <> 221100 then raise exception 'TEST FAILED: the total moved to %', t; end if;
  raise notice 'ok  1,105.50 a sack is 22.11 a kilo, and the total holds';
end $$;

-- 4. Draws follow their lot --------------------------------------------------
do $$
declare q numeric;
begin
  select quantity into q from input_draws
  where purchase_id = 'b0000000-0000-0000-0000-000000000001';
  if q <> 75 then raise exception 'TEST FAILED: 1.5 sacks drawn became %', q; end if;
  raise notice 'ok  a draw of 1.5 sacks reads as 75 kg';
end $$;

-- 5. Anything already in kilos is left alone ---------------------------------
do $$
declare q numeric; c bigint; d numeric;
begin
  select quantity, unit_cost_centavos into q, c
  from input_purchases where id = 'b0000000-0000-0000-0000-000000000003';
  select quantity into d from input_draws
  where purchase_id = 'b0000000-0000-0000-0000-000000000003';
  if q <> 4 or c <> 50000 or d <> 0.5 then
    raise exception 'TEST FAILED: the zinc sulfate was touched: % kg at %, drew %', q, c, d;
  end if;
  raise notice 'ok  an input already counted in kilos is not converted twice';
end $$;

-- 6. Stock on hand is the same stock -----------------------------------------
do $$
declare remaining numeric;
begin
  select p.quantity - coalesce(sum(d.quantity), 0) into remaining
  from input_purchases p
  left join input_draws d on d.purchase_id = p.id
  where p.id = 'b0000000-0000-0000-0000-000000000001'
  group by p.quantity;
  -- 5 sacks less 1.5 drawn is 3.5 sacks, which is 175 kg.
  if remaining <> 175 then
    raise exception 'TEST FAILED: 3.5 sacks left reads as % kg', remaining;
  end if;
  raise notice 'ok  3.5 sacks left in the lot reads as 175 kg';
end $$;

-- 7. Running it again does nothing -------------------------------------------
\i supabase/migrations/0036_fertiliser_in_kilos.sql
do $$
declare q numeric;
begin
  select quantity into q from input_purchases
  where id = 'b0000000-0000-0000-0000-000000000001';
  if q <> 250 then raise exception 'TEST FAILED: a second run made it % kg', q; end if;
  raise notice 'ok  running it twice does not convert twice';
end $$;

-- 8. A price that will not divide stops the whole thing ----------------------
-- One lot left in sacks while the rest are kilos would put two units under
-- one name, and every figure that summed them would be wrong by fifty.
do $$
declare converted int;
begin
  update input_types set unit = 'sack', kg_per_unit = 50 where code = 'urea';
  update input_purchases set quantity = 5, unit = 'sack',
         unit_cost_centavos = 110001, total_centavos = 550005
  where id = 'b0000000-0000-0000-0000-000000000001';

  begin
    execute $m$ do $inner$
      declare sacks text[] := array['urea'];
              bad text;
      begin
        select string_agg(id::text, ', ') into bad from input_purchases
        where input_type = any(sacks) and unit_cost_centavos % 50 <> 0;
        if bad is not null then
          raise exception 'Cannot convert to kilos: lots: %', bad;
        end if;
      end $inner$ $m$;
    raise exception 'TEST FAILED: an indivisible price was allowed through';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;

  select count(*) into converted from input_purchases
  where id = 'b0000000-0000-0000-0000-000000000001' and unit = 'kg';
  if converted <> 0 then
    raise exception 'TEST FAILED: the lot was converted despite the bad price';
  end if;
  raise notice 'ok  an indivisible price refuses the migration instead of half-doing it';
end $$;

rollback;
