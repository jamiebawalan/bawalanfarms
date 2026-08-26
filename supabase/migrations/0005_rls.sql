-- 0005_rls.sql — row level security.
--
-- Three people use this farm. The threat model is not each other, it is
-- accidental corruption and a stray anon key, so every table is deny-by-default
-- and access is granted by being listed in app_users.
--
-- To add or remove a person, insert or delete a row in app_users. There is no
-- second list to keep in step, and no redeploy.

create or replace function current_email()
returns text language sql stable as $$
  select lower(nullif(current_setting('request.jwt.claims', true)::json ->> 'email', ''));
$$;

create or replace function is_allowed()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where email = current_email());
$$;

create or replace function is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where email = current_email() and role = 'owner');
$$;

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
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- Everyone on the list reads everything. The owners want the farm manager to
-- see his own numbers; hiding reports from him would defeat the point.
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
    execute format(
      'create policy %I on %I for select using (is_allowed())', t || '_read', t);
  end loop;
end $$;

-- Transaction tables: anyone on the list may write. This is the farm manager's
-- job and the app must never stand between him and logging a cost.
do $$
declare t text;
begin
  foreach t in array array[
    'crop_cycles','plant_count_observations','capital_assets',
    'expenses','expense_allocations',
    'input_purchases','input_draws',
    'harvests','harvest_lines','sales','sale_lines'
  ]
  loop
    execute format(
      'create policy %I on %I for insert with check (is_allowed())', t || '_insert', t);
    execute format(
      'create policy %I on %I for update using (is_allowed()) with check (is_allowed())',
      t || '_update', t);
    -- Deleting is the one destructive act, so it stays with the owners.
    execute format(
      'create policy %I on %I for delete using (is_owner())', t || '_delete', t);
  end loop;
end $$;

-- Reference data and the access list itself are owner-only to change. A typo in
-- a plot area silently rewrites every historical split, so it is not a field edit.
do $$
declare t text;
begin
  foreach t in array array[
    'app_users','people','plots','plot_areas','plot_mayors',
    'crops','activities','buyers','products','input_types'
  ]
  loop
    execute format(
      'create policy %I on %I for insert with check (is_owner())', t || '_insert', t);
    execute format(
      'create policy %I on %I for update using (is_owner()) with check (is_owner())',
      t || '_update', t);
    execute format(
      'create policy %I on %I for delete using (is_owner())', t || '_delete', t);
  end loop;
end $$;
