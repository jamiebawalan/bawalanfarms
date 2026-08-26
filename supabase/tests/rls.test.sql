-- rls.test.sql — proves the access list is the access list.
--
-- The rule tests run as superuser, which bypasses row level security entirely.
-- These run as an ordinary role, the way the app does.

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- Stand in for the roles Supabase provides.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

\i supabase/migrations/0008_grants.sql

begin;

insert into app_users (email, role, display_name) values
  ('owner@example.com', 'owner', 'Owner'),
  ('manager@example.com', 'manager', 'Manager');

insert into crop_cycles (id, plot_id, crop, status, date_started)
select '11111111-1111-1111-1111-111111111111', id, 'pineapple', 'growing', date '2024-01-10'
from plots where code = '1';

-- Anyone on the list reads everything ---------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"email":"manager@example.com"}', true); end $$;

do $$
declare n int;
begin
  select count(*) into n from plots;
  if n = 0 then raise exception 'TEST FAILED: a listed user cannot read plots'; end if;
  select count(*) into n from crop_cycles;
  if n <> 1 then raise exception 'TEST FAILED: a listed user cannot read cycles'; end if;
  raise notice 'ok  a listed user reads the farm''s data';
end $$;

-- ...and may log costs -------------------------------------------------------
do $$
begin
  perform save_expense(jsonb_build_object(
    'date', current_date::text, 'category', 'Labor', 'activity', 'deweed',
    'attribution', 'direct', 'amount_centavos', 180000,
    'allocations', jsonb_build_array(jsonb_build_object(
      'plot_id', (select id from plots where code = '1')::text,
      'amount_centavos', 180000))));
  raise notice 'ok  the farm manager can log a cost';
end $$;

-- ...but not rewrite a plot area, which silently rewrites every old split -----
do $$
begin
  begin
    update plot_areas set area_sqm = 1;
    if found then raise exception 'TEST FAILED: a manager rewrote plot areas'; end if;
  exception when insufficient_privilege then
    null;  -- also an acceptable refusal
  end;
  if (select area_sqm from plot_areas
      where plot_id = (select id from plots where code = '1')) <> 7056 then
    raise exception 'TEST FAILED: plot area was changed by a manager';
  end if;
  raise notice 'ok  a manager cannot rewrite plot areas';
end $$;

-- ...and cannot delete -------------------------------------------------------
do $$
declare n int;
begin
  delete from expenses;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST FAILED: a manager deleted % expenses', n; end if;
  raise notice 'ok  deleting is left to the owners';
end $$;

-- An email that is not on the list sees nothing ------------------------------
do $$ begin perform set_config('request.jwt.claims', '{"email":"stranger@example.com"}', true); end $$;

do $$
declare n int;
begin
  select count(*) into n from plots;
  if n <> 0 then raise exception 'TEST FAILED: a stranger read % plots', n; end if;
  select count(*) into n from expenses;
  if n <> 0 then raise exception 'TEST FAILED: a stranger read % expenses', n; end if;
  select count(*) into n from app_users;
  if n <> 0 then raise exception 'TEST FAILED: a stranger read the access list'; end if;
  raise notice 'ok  an email that is not on the list sees nothing at all';
end $$;

do $$
begin
  begin
    insert into expenses (date, category, activity, attribution, farm_wide_reason,
                          amount_centavos)
    values (current_date, 'Machines', 'barang', 'farm_wide', 'vehicle', 100000);
    raise exception 'TEST FAILED: a stranger wrote an expense';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
    raise notice 'ok  a stranger cannot write';
  end;
end $$;

-- With no session at all -----------------------------------------------------
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
do $$
declare n int;
begin
  select count(*) into n from plots;
  if n <> 0 then raise exception 'TEST FAILED: an anonymous caller read % plots', n; end if;
  raise notice 'ok  no session, no data';
end $$;

-- The owner can do the things the manager cannot ------------------------------
do $$ begin perform set_config('request.jwt.claims', '{"email":"owner@example.com"}', true); end $$;
do $$
declare n int;
begin
  update plot_areas set area_sqm = 7100
   where plot_id = (select id from plots where code = '1');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST FAILED: an owner could not correct a plot area'; end if;
  raise notice 'ok  an owner can correct reference data';
end $$;

reset role;
rollback;
