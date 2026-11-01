-- 0026_expenses_to_blocks.sql — a cost can name the block it was spent on.
--
-- The allocation column arrived with the blocks themselves (0025). This is the
-- write path catching up: both save functions now carry sub_plot_id through
-- from what the form sends, so "two men weeding block B" is recorded as that
-- and not divided across blocks that nobody touched that morning.
--
-- Untagged costs are still untagged, and still divided when they are read.
-- Most costs are genuinely for the whole plot, and asking him to pick a block
-- for every sack of fertiliser would be asking him to invent an answer.

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
  if exists (select 1 from expenses where id = new_id) then
    return new_id;
  end if;

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
    insert into expense_allocations (expense_id, plot_id, cycle_id, sub_plot_id, amount_centavos)
    values (
      new_id,
      (alloc ->> 'plot_id')::uuid,
      coalesce(
        (alloc ->> 'cycle_id')::uuid,
        cycle_for_plot_on((alloc ->> 'plot_id')::uuid, (payload ->> 'date')::date)
      ),
      nullif(alloc ->> 'sub_plot_id', '')::uuid,
      (alloc ->> 'amount_centavos')::bigint
    );
  end loop;

  return new_id;
end;
$$;

-- The correction path, same change. An expense reopened and re-saved keeps
-- whatever block the form sends back, which is how a cost mistakenly left on
-- the whole plot gets moved onto the block it belonged to.
create or replace function update_expense(payload jsonb)
returns uuid
language plpgsql as $$
declare
  target      uuid := (payload ->> 'id')::uuid;
  revision    uuid := nullif(payload ->> 'revision_id', '')::uuid;
  existing    expenses%rowtype;
  frozen      uuid;
  alloc       jsonb;
  new_attr    expense_attribution := (payload ->> 'attribution')::expense_attribution;
  asset       jsonb := payload -> 'new_capital_asset';
begin
  select * into existing from expenses where id = target;
  if not found then
    raise exception 'no such cost %', target;
  end if;

  if existing.voided_at is not null then
    raise exception 'that cost was deleted, so it cannot be corrected';
  end if;

  if revision is not null and exists (select 1 from expense_revisions where id = revision) then
    return target;
  end if;

  if (existing.attribution = 'capital') <> (new_attr = 'capital') then
    raise exception 'an equipment purchase cannot be changed into an ordinary cost, or the other way round — delete this entry and log it again';
  end if;

  select a.cycle_id into frozen
    from expense_allocations a
    join crop_cycles c on c.id = a.cycle_id
   where a.expense_id = target and c.status = 'closed'
   limit 1;
  if frozen is not null and not importing() then
    raise exception 'cycle % is closed; its P&L is frozen', frozen;
  end if;

  insert into expense_revisions (id, expense_id, kind, before, reason, revised_by)
  values (
    coalesce(revision, gen_random_uuid()),
    target, 'edit', expense_snapshot(target),
    nullif(payload ->> 'revision_note', ''), current_email()
  );

  if existing.capital_asset_id is not null then
    update capital_assets
       set name               = coalesce(nullif(asset ->> 'name', ''), name),
           purchase_date      = (payload ->> 'date')::date,
           cost_centavos      = (payload ->> 'amount_centavos')::bigint,
           useful_life_months = coalesce((asset ->> 'useful_life_months')::int, useful_life_months)
     where id = existing.capital_asset_id;
  end if;

  update expenses set
    date                = (payload ->> 'date')::date,
    category            = (payload ->> 'category')::expense_category,
    activity            = payload ->> 'activity',
    activity_other_note = nullif(payload ->> 'activity_other_note', ''),
    attribution         = new_attr,
    farm_wide_reason    = nullif(payload ->> 'farm_wide_reason', '')::farm_wide_reason,
    labour_mode         = nullif(payload ->> 'labour_mode', '')::labour_mode,
    unit_price_centavos = nullif(payload ->> 'unit_price_centavos', '')::bigint,
    quantity            = nullif(payload ->> 'quantity', '')::numeric,
    amount_centavos     = (payload ->> 'amount_centavos')::bigint,
    paid_to             = nullif(payload ->> 'paid_to', ''),
    photo_path          = coalesce(nullif(payload ->> 'photo_path', ''), photo_path),
    note                = nullif(payload ->> 'note', ''),
    revised_at          = now()
  where id = target;

  delete from expense_allocations where expense_id = target;

  for alloc in select * from jsonb_array_elements(coalesce(payload -> 'allocations', '[]'::jsonb))
  loop
    insert into expense_allocations (expense_id, plot_id, cycle_id, sub_plot_id, amount_centavos)
    values (
      target,
      (alloc ->> 'plot_id')::uuid,
      coalesce(
        (alloc ->> 'cycle_id')::uuid,
        cycle_for_plot_on((alloc ->> 'plot_id')::uuid, (payload ->> 'date')::date)
      ),
      nullif(alloc ->> 'sub_plot_id', '')::uuid,
      (alloc ->> 'amount_centavos')::bigint
    );
  end loop;

  return target;
end;
$$;
