-- 0008_grants.sql — table privileges.
--
-- Supabase grants new public tables to anon and authenticated by default, which
-- means the deny-by-default posture depends on a project setting rather than on
-- anything in this repository. These grants make it explicit:
--
--   anon           can do nothing at all — not even read the plot list
--   authenticated  is allowed at the SQL level, and then filtered by RLS,
--                  which returns nothing to an email not in app_users
--
-- Being explicit also means a fresh database restored from these migrations
-- behaves the same as the live one.

do $$
declare t text;
begin
  foreach t in array array[
    'app_users','people','plots','plot_areas','plot_mayors',
    'crops','activities','buyers','products','input_types',
    'crop_cycles','plant_count_observations','capital_assets',
    'expenses','expense_allocations',
    'input_purchases','input_draws',
    'harvests','harvest_lines','sales','sale_lines'
  ]
  loop
    execute format('revoke all on table %I from public', t);
    -- The roles exist in Supabase; locally they may not, and their absence is
    -- not a reason for the migration to fail.
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table %I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format(
        'grant select, insert, update, delete on table %I to authenticated', t);
    end if;
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'save_expense(jsonb)', 'save_sale(jsonb)', 'save_harvest(jsonb)',
    'close_cycle(uuid, date)', 'reopen_cycle(uuid)',
    'cycle_for_plot_on(uuid, date)', 'plot_area_on(uuid, date)'
  ]
  loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;

  -- The import runs with the service role and checks is_owner() itself.
  execute 'revoke all on function import_expenses(jsonb) from public';
  execute 'revoke all on function import_cycles(jsonb) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function import_expenses(jsonb) from anon';
    execute 'revoke all on function import_cycles(jsonb) from anon';
  end if;
end $$;
