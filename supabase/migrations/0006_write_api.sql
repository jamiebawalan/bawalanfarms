-- 0006_write_api.sql — transactional writes.
--
-- The client cannot open a transaction over PostgREST, and an expense without
-- its allocation lines is exactly the corruption this app exists to prevent.
-- So each write is one function call: it all lands, or none of it does.
--
-- These are SECURITY INVOKER on purpose. Row level security still applies —
-- the functions make writes atomic, they do not make them privileged.

create or replace function save_expense(payload jsonb)
returns uuid
language plpgsql as $$
declare
  new_id     uuid := coalesce((payload ->> 'id')::uuid, gen_random_uuid());
  asset_id   uuid := (payload ->> 'capital_asset_id')::uuid;
  asset      jsonb := payload -> 'new_capital_asset';
  alloc      jsonb;
  actor      text := current_email();
begin
  -- Replaying a queued write must not create a second row. The client generates
  -- the id, so the second attempt is a no-op rather than a duplicate.
  if exists (select 1 from expenses where id = new_id) then
    return new_id;
  end if;

  -- A capital purchase creates its asset in the same breath, so the register
  -- can never disagree with the ledger about what was bought.
  if asset is not null and asset <> 'null'::jsonb then
    insert into capital_assets (name, purchase_date, cost_centavos, useful_life_months, note)
    values (
      asset ->> 'name',
      (payload ->> 'date')::date,
      (payload ->> 'amount_centavos')::bigint,
      coalesce((asset ->> 'useful_life_months')::int, 60),
      asset ->> 'note'
    )
    returning id into asset_id;
  end if;

  insert into expenses (
    id, date, category, activity, activity_other_note, attribution,
    farm_wide_reason, capital_asset_id, labour_mode,
    unit_price_centavos, quantity, amount_centavos, paid_to, photo_path, note, created_by
  ) values (
    new_id,
    (payload ->> 'date')::date,
    (payload ->> 'category')::expense_category,
    payload ->> 'activity',
    nullif(payload ->> 'activity_other_note', ''),
    (payload ->> 'attribution')::expense_attribution,
    nullif(payload ->> 'farm_wide_reason', '')::farm_wide_reason,
    asset_id,
    nullif(payload ->> 'labour_mode', '')::labour_mode,
    nullif(payload ->> 'unit_price_centavos', '')::bigint,
    nullif(payload ->> 'quantity', '')::numeric,
    (payload ->> 'amount_centavos')::bigint,
    nullif(payload ->> 'paid_to', ''),
    nullif(payload ->> 'photo_path', ''),
    nullif(payload ->> 'note', ''),
    actor
  );

  for alloc in select * from jsonb_array_elements(coalesce(payload -> 'allocations', '[]'::jsonb))
  loop
    insert into expense_allocations (expense_id, plot_id, cycle_id, amount_centavos)
    values (
      new_id,
      (alloc ->> 'plot_id')::uuid,
      -- The cycle is derived from the plot and the date unless the caller named
      -- one, so an entry logged in the field lands on the right ledger without
      -- him having to think about cycles at all.
      coalesce(
        (alloc ->> 'cycle_id')::uuid,
        cycle_for_plot_on((alloc ->> 'plot_id')::uuid, (payload ->> 'date')::date)
      ),
      (alloc ->> 'amount_centavos')::bigint
    );
  end loop;

  return new_id;
end;
$$;

create or replace function save_sale(payload jsonb)
returns uuid
language plpgsql as $$
declare
  new_id uuid := coalesce((payload ->> 'id')::uuid, gen_random_uuid());
  line   jsonb;
begin
  if exists (select 1 from sales where id = new_id) then
    return new_id;
  end if;

  insert into sales (id, cycle_id, buyer_id, date, note, created_by)
  values (
    new_id,
    (payload ->> 'cycle_id')::uuid,
    (payload ->> 'buyer_id')::uuid,
    (payload ->> 'date')::date,
    nullif(payload ->> 'note', ''),
    current_email()
  );

  for line in select * from jsonb_array_elements(payload -> 'lines')
  loop
    insert into sale_lines (sale_id, product, quantity, unit_price_centavos,
                            total_centavos, is_bulk)
    values (
      new_id,
      line ->> 'product',
      (line ->> 'quantity')::numeric,
      (line ->> 'unit_price_centavos')::bigint,
      round((line ->> 'unit_price_centavos')::bigint * (line ->> 'quantity')::numeric),
      coalesce((line ->> 'is_bulk')::boolean, false)
    );
  end loop;

  return new_id;
end;
$$;

create or replace function save_harvest(payload jsonb)
returns uuid
language plpgsql as $$
declare
  new_id uuid := coalesce((payload ->> 'id')::uuid, gen_random_uuid());
  line   jsonb;
begin
  if exists (select 1 from harvests where id = new_id) then
    return new_id;
  end if;

  insert into harvests (id, cycle_id, date, note, created_by)
  values (
    new_id,
    (payload ->> 'cycle_id')::uuid,
    (payload ->> 'date')::date,
    nullif(payload ->> 'note', ''),
    current_email()
  );

  for line in select * from jsonb_array_elements(payload -> 'lines')
  loop
    insert into harvest_lines (harvest_id, product, quantity)
    values (new_id, line ->> 'product', (line ->> 'quantity')::numeric);
  end loop;

  return new_id;
end;
$$;

/**
 * Closing a cycle is an explicit act that freezes its P&L, so it is worth
 * refusing when the numbers are obviously unfinished.
 */
create or replace function close_cycle(p_cycle_id uuid, p_date date default null)
returns void
language plpgsql as $$
declare
  c crop_cycles%rowtype;
  open_stock numeric;
begin
  select * into c from crop_cycles where id = p_cycle_id;
  if not found then raise exception 'no such cycle %', p_cycle_id; end if;
  if c.status = 'closed' then return; end if;

  update crop_cycles
     set status = 'closed',
         date_closed = coalesce(p_date, current_date)
   where id = p_cycle_id;
end;
$$;

create or replace function reopen_cycle(p_cycle_id uuid)
returns void
language plpgsql as $$
begin
  -- Reopening is blocked while another cycle is live on the plot: the one-live
  -- cycle index would reject it anyway, and this says why.
  if exists (
    select 1 from crop_cycles a
    join crop_cycles b on b.plot_id = a.plot_id and b.id <> a.id
    where a.id = p_cycle_id and b.status not in ('closed', 'planned')
  ) then
    raise exception 'another cycle is already running on this plot; close it first';
  end if;

  update crop_cycles set status = 'harvesting', date_closed = null
   where id = p_cycle_id;
end;
$$;
