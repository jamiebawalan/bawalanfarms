-- 0007_import.sql — the historical import.
--
-- Three things this has to be, all of them for the same reason: the owner will
-- run it, find something wrong, fix the sheet and run it again.
--
--   transactional — a file that fails halfway leaves nothing behind
--   idempotent    — re-importing a corrected file replaces its rows, never
--                   doubles them
--   honest        — it returns what it wrote and what it could not

create or replace function import_expenses(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data     jsonb;
  alloc        jsonb;
  new_id       uuid;
  cycle        uuid;
  written      int := 0;
  replaced     int := 0;
  keys         text[] := array[]::text[];
begin
  if not is_owner() then
    raise exception 'only an owner may run the import';
  end if;

  -- Lifts the closed-cycle freeze for this transaction only. Historical costs
  -- have to land on cycles that finished years ago.
  perform set_config('farm.importing', 'on', true);

  -- An expense and its allocation lines are inserted as separate statements, so
  -- the shape checks have to wait until the batch is built. A previous call in
  -- the same transaction may have left them immediate.
  set constraints all deferred;

  for row_data in select * from jsonb_array_elements(payload -> 'expenses')
  loop
    keys := keys || (row_data ->> 'import_key');
  end loop;

  -- A corrected file replaces the rows it covers. Allocations go with them.
  select count(*) into replaced from expenses where import_key = any(keys);
  delete from expenses where import_key = any(keys);

  for row_data in select * from jsonb_array_elements(payload -> 'expenses')
  loop
    insert into expenses (
      date, category, activity, activity_other_note, attribution,
      farm_wide_reason, labour_mode, unit_price_centavos, quantity,
      amount_centavos, paid_to, note, import_key, created_by
    ) values (
      (row_data ->> 'date')::date,
      (row_data ->> 'category')::expense_category,
      row_data ->> 'activity',
      nullif(row_data ->> 'activity_other_note', ''),
      (row_data ->> 'attribution')::expense_attribution,
      nullif(row_data ->> 'farm_wide_reason', '')::farm_wide_reason,
      nullif(row_data ->> 'labour_mode', '')::labour_mode,
      nullif(row_data ->> 'unit_price_centavos', '')::bigint,
      nullif(row_data ->> 'quantity', '')::numeric,
      (row_data ->> 'amount_centavos')::bigint,
      nullif(row_data ->> 'paid_to', ''),
      nullif(row_data ->> 'note', ''),
      row_data ->> 'import_key',
      current_email()
    )
    returning id into new_id;

    for alloc in select * from jsonb_array_elements(coalesce(row_data -> 'allocations', '[]'::jsonb))
    loop
      -- Each cost attaches to whichever cycle was open on that plot on that
      -- date. That is what turns a flat list of rows into per-cycle profit.
      cycle := cycle_for_plot_on(
        (alloc ->> 'plot_id')::uuid,
        (row_data ->> 'date')::date
      );
      insert into expense_allocations (expense_id, plot_id, cycle_id, amount_centavos)
      values (
        new_id,
        (alloc ->> 'plot_id')::uuid,
        cycle,
        (alloc ->> 'amount_centavos')::bigint
      );
    end loop;

    written := written + 1;
  end loop;

  -- Fire the deferred checks here, inside the function, so a bad batch raises
  -- and rolls back rather than surfacing as a mysterious error at commit.
  set constraints all immediate;

  return jsonb_build_object(
    'written', written,
    'replaced', replaced,
    'unattached', (
      select count(*) from expense_allocations a
      join expenses e on e.id = a.expense_id
      where e.import_key = any(keys) and a.cycle_id is null
    )
  );
end;
$$;

/**
 * Historical cycles, created ahead of the expenses so that the costs have
 * something to attach to. Matched on plot and start date so re-running is safe.
 */
create or replace function import_cycles(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  created  int := 0;
  skipped  int := 0;
begin
  if not is_owner() then
    raise exception 'only an owner may run the import';
  end if;
  perform set_config('farm.importing', 'on', true);
  set constraints all deferred;

  for row_data in select * from jsonb_array_elements(payload -> 'cycles')
  loop
    if exists (
      select 1 from crop_cycles
      where plot_id = (row_data ->> 'plot_id')::uuid
        and coalesce(date_started, date_planted) = (row_data ->> 'date_started')::date
    ) then
      skipped := skipped + 1;
      continue;
    end if;

    insert into crop_cycles (
      plot_id, crop, status, date_started, date_planted, date_closed,
      planting_material_source, notes, created_by
    ) values (
      (row_data ->> 'plot_id')::uuid,
      row_data ->> 'crop',
      (row_data ->> 'status')::cycle_status,
      (row_data ->> 'date_started')::date,
      nullif(row_data ->> 'date_planted', '')::date,
      nullif(row_data ->> 'date_closed', '')::date,
      nullif(row_data ->> 'planting_material_source', ''),
      nullif(row_data ->> 'notes', ''),
      current_email()
    );
    created := created + 1;
  end loop;

  set constraints all immediate;
  return jsonb_build_object('created', created, 'skipped', skipped);
end;
$$;
