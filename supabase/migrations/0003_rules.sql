-- 0003_rules.sql — invariants that live in the database.
--
-- These are the rules whose absence corrupted the old spreadsheet. Putting them
-- here means the import, a stray SQL console and the app are all held to them.

-- Which cycle was live on a plot on a given date. Used to attach an expense to
-- a cycle automatically, and by the historical import to backdate costs.
create or replace function cycle_for_plot_on(p_plot_id uuid, p_date date)
returns uuid
language sql stable as $$
  select c.id
  from crop_cycles c
  where c.plot_id = p_plot_id
    and c.status <> 'planned'
    and coalesce(c.date_started, c.date_planted, c.date_closed) <= p_date
    and (c.date_closed is null or c.date_closed >= p_date)
  order by coalesce(c.date_started, c.date_planted) desc
  limit 1;
$$;

-- The plot's area in force on a given date.
create or replace function plot_area_on(p_plot_id uuid, p_date date)
returns numeric
language sql stable as $$
  select a.area_sqm
  from plot_areas a
  where a.plot_id = p_plot_id and a.effective_from <= p_date
  order by a.effective_from desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Allocation shape must match the attribution the user chose
-- ---------------------------------------------------------------------------
-- Deferred: an expense and its allocation rows are inserted in one transaction,
-- so the check has to run at commit rather than after the first statement.

create or replace function check_expense_allocations()
returns trigger language plpgsql as $$
declare
  e            expenses%rowtype;
  alloc_count  integer;
  alloc_total  bigint;
  target_id    uuid := coalesce(new.id, old.id);
begin
  if tg_table_name = 'expense_allocations' then
    target_id := coalesce(new.expense_id, old.expense_id);
  end if;

  select * into e from expenses where id = target_id;
  if not found then
    return null;  -- expense deleted; allocations went with it
  end if;

  select count(*), coalesce(sum(amount_centavos), 0)
    into alloc_count, alloc_total
  from expense_allocations where expense_id = e.id;

  if e.attribution = 'direct' and alloc_count <> 1 then
    raise exception 'direct expense % must have exactly one plot, found %', e.id, alloc_count;
  end if;

  if e.attribution = 'split' and alloc_count < 2 then
    raise exception 'split expense % must cover at least two plots, found %', e.id, alloc_count;
  end if;

  if e.attribution in ('farm_wide', 'capital') and alloc_count <> 0 then
    raise exception '% expense % must not name plots, found %', e.attribution, e.id, alloc_count;
  end if;

  -- The split the farm manager confirmed on screen is what gets stored, so it
  -- has to add up to the amount he entered — to the centavo.
  if e.attribution in ('direct', 'split') and alloc_total <> e.amount_centavos then
    raise exception 'allocations for expense % total % but the expense is %',
      e.id, alloc_total, e.amount_centavos;
  end if;

  return null;
end;
$$;

create constraint trigger expenses_allocation_shape
  after insert or update on expenses
  deferrable initially deferred
  for each row execute function check_expense_allocations();

create constraint trigger expense_allocations_shape
  after insert or update or delete on expense_allocations
  deferrable initially deferred
  for each row execute function check_expense_allocations();

-- ---------------------------------------------------------------------------
-- Input stock cannot go negative
-- ---------------------------------------------------------------------------

create or replace function check_input_draw_balance()
returns trigger language plpgsql as $$
declare
  purchased numeric(14,3);
  drawn     numeric(14,3);
  p_id      uuid := coalesce(new.purchase_id, old.purchase_id);
begin
  select quantity into purchased from input_purchases where id = p_id;
  select coalesce(sum(quantity), 0) into drawn from input_draws where purchase_id = p_id;

  if drawn > purchased then
    raise exception 'lot % holds % but draws total % — % over',
      p_id, purchased, drawn, drawn - purchased;
  end if;
  return null;
end;
$$;

create constraint trigger input_draws_balance
  after insert or update on input_draws
  deferrable initially deferred
  for each row execute function check_input_draw_balance();

-- ---------------------------------------------------------------------------
-- Closing a cycle freezes its ledger
-- ---------------------------------------------------------------------------
-- Closing is an explicit action. After it, nothing new lands on that cycle —
-- otherwise a "closed" P&L would keep moving underneath the owners.

create or replace function assert_cycle_open()
returns trigger language plpgsql as $$
declare
  c crop_cycles%rowtype;
begin
  select * into c from crop_cycles where id = new.cycle_id;
  if c.status = 'closed' then
    raise exception 'cycle % is closed; reopen it before adding %', new.cycle_id, tg_table_name;
  end if;
  return new;
end;
$$;

create trigger input_draws_cycle_open   before insert on input_draws
  for each row execute function assert_cycle_open();
create trigger harvests_cycle_open      before insert on harvests
  for each row execute function assert_cycle_open();
create trigger sales_cycle_open         before insert on sales
  for each row execute function assert_cycle_open();
create trigger plant_counts_cycle_open  before insert on plant_count_observations
  for each row execute function assert_cycle_open();

create or replace function assert_alloc_cycle_open()
returns trigger language plpgsql as $$
declare
  c crop_cycles%rowtype;
begin
  if new.cycle_id is null then return new; end if;
  select * into c from crop_cycles where id = new.cycle_id;
  if c.status = 'closed' then
    raise exception 'cycle % is closed; its P&L is frozen', new.cycle_id;
  end if;
  return new;
end;
$$;

create trigger expense_allocations_cycle_open before insert on expense_allocations
  for each row execute function assert_alloc_cycle_open();

-- The import needs to write costs onto cycles that were already closed years
-- ago. It sets this flag inside its transaction to lift the freeze.
create or replace function importing()
returns boolean language sql stable as $$
  select coalesce(current_setting('farm.importing', true), 'off') = 'on';
$$;

create or replace function assert_cycle_open()
returns trigger language plpgsql as $$
declare
  c crop_cycles%rowtype;
begin
  if importing() then return new; end if;
  select * into c from crop_cycles where id = new.cycle_id;
  if c.status = 'closed' then
    raise exception 'cycle % is closed; reopen it before adding %', new.cycle_id, tg_table_name;
  end if;
  return new;
end;
$$;

create or replace function assert_alloc_cycle_open()
returns trigger language plpgsql as $$
declare
  c crop_cycles%rowtype;
begin
  if new.cycle_id is null or importing() then return new; end if;
  select * into c from crop_cycles where id = new.cycle_id;
  if c.status = 'closed' then
    raise exception 'cycle % is closed; its P&L is frozen', new.cycle_id;
  end if;
  return new;
end;
$$;

-- Closing stamps the date; reopening clears it. Keeps status and date_closed
-- from ever disagreeing.
create or replace function sync_cycle_closed_date()
returns trigger language plpgsql as $$
begin
  if new.status = 'closed' and new.date_closed is null then
    new.date_closed := current_date;
  elsif new.status <> 'closed' then
    new.date_closed := null;
  end if;
  return new;
end;
$$;

create trigger crop_cycles_close_date before insert or update on crop_cycles
  for each row execute function sync_cycle_closed_date();
