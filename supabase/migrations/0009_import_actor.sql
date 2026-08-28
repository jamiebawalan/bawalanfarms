-- 0009_import_actor.sql — let the import know who is running it.
--
-- The import writes backdated rows onto cycles that closed years ago, which
-- row level security and the closed-cycle freeze both refuse for an ordinary
-- session. So it runs with the service role — and the service role carries no
-- user identity at all. current_email() returns null, is_owner() returns false,
-- and the function refused every import including a genuine owner's.
--
-- The fix is to pass the actor in. The API route has already verified the
-- session and read the role before it ever reaches here; this function checks
-- that claim again against app_users rather than trusting it, so a caller
-- cannot simply name themselves an owner.

-- Adding an argument creates an OVERLOAD rather than replacing the function, so
-- the old single-argument versions have to go. Left in place, a one-argument
-- call matches both and Postgres refuses it as ambiguous.
drop function if exists import_expenses(jsonb);
drop function if exists import_cycles(jsonb);

create or replace function import_expenses(payload jsonb, actor_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  alloc    jsonb;
  new_id   uuid;
  cycle    uuid;
  written  int := 0;
  replaced int := 0;
  keys     text[] := array[]::text[];
  actor    text := lower(coalesce(nullif(btrim(actor_email), ''), current_email(), ''));
begin
  if not exists (select 1 from app_users where email = actor and role = 'owner') then
    raise exception 'only an owner may run the import (got %)',
      coalesce(nullif(actor, ''), 'no signed-in user');
  end if;

  perform set_config('farm.importing', 'on', true);
  set constraints all deferred;

  for row_data in select * from jsonb_array_elements(payload -> 'expenses')
  loop
    keys := keys || (row_data ->> 'import_key');
  end loop;

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
      actor
    )
    returning id into new_id;

    for alloc in select * from jsonb_array_elements(coalesce(row_data -> 'allocations', '[]'::jsonb))
    loop
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

create or replace function import_cycles(payload jsonb, actor_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  created  int := 0;
  skipped  int := 0;
  actor    text := lower(coalesce(nullif(btrim(actor_email), ''), current_email(), ''));
begin
  if not exists (select 1 from app_users where email = actor and role = 'owner') then
    raise exception 'only an owner may run the import (got %)',
      coalesce(nullif(actor, ''), 'no signed-in user');
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
      actor
    );
    created := created + 1;
  end loop;

  set constraints all immediate;
  return jsonb_build_object('created', created, 'skipped', skipped);
end;
$$;

revoke all on function import_expenses(jsonb, text) from public;
revoke all on function import_cycles(jsonb, text) from public;
