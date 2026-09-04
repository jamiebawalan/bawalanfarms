-- 0022_correct_expenses.sql — correcting an entry that was already saved.
--
-- The farm manager logs costs from the field, in a hurry, on a phone. He will
-- tap the wrong plot, type 4,500 for 450, and pick "deweed" when it was
-- "abono". Until now the only fix was to ask an owner to open the Supabase
-- console, which means in practice the wrong figure stayed.
--
-- Two shapes of correction, and they are not the same fact:
--
--   edit  — the cost happened, these details were wrong. The row is corrected
--           in place, and the version before the change is kept.
--   void  — the cost did not happen, or it was logged twice. The row stays,
--           marked void, and drops out of every report.
--
-- Nothing is deleted. Deleting is owner-only by policy (0005) and would leave
-- the owners looking at a ledger that had quietly changed shape between two
-- readings. A void is an update, so the manager can do it himself, and the
-- record of what he entered and what he changed it to survives.

alter table expenses
  add column if not exists revised_at  timestamptz,
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   text references app_users(email),
  add column if not exists void_reason text;

alter table expenses drop constraint if exists void_needs_reason;
alter table expenses add constraint void_needs_reason check (
  voided_at is null or (void_reason is not null and length(btrim(void_reason)) > 2)
);

create index if not exists expenses_live on expenses (date desc) where voided_at is null;

-- ---------------------------------------------------------------------------
-- What it looked like before
-- ---------------------------------------------------------------------------
-- One row per correction, holding the whole expense and its allocation lines
-- as they stood. This is the answer to "that plot's costs moved — who moved
-- them?", which is a question three people sharing one ledger will ask.

create table if not exists expense_revisions (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references expenses(id) on delete cascade,
  kind        text not null check (kind in ('edit', 'void')),
  -- The full row plus its allocations, as they were before this change.
  before      jsonb not null,
  reason      text,
  revised_at  timestamptz not null default now(),
  revised_by  text references app_users(email)
);

create index if not exists expense_revisions_expense
  on expense_revisions (expense_id, revised_at desc);

alter table expense_revisions enable row level security;
alter table expense_revisions force row level security;

drop policy if exists expense_revisions_read on expense_revisions;
create policy expense_revisions_read on expense_revisions
  for select using (is_allowed());

-- Written only by the functions below, which run as the caller. There is no
-- update or delete policy at all: a correction history that can itself be
-- corrected is not a history.
drop policy if exists expense_revisions_insert on expense_revisions;
create policy expense_revisions_insert on expense_revisions
  for insert with check (is_allowed());

revoke all on table expense_revisions from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table expense_revisions from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert on table expense_revisions to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The before-image
-- ---------------------------------------------------------------------------

create or replace function expense_snapshot(p_id uuid)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'expense', to_jsonb(e),
    'allocations', coalesce(
      (select jsonb_agg(to_jsonb(a) order by a.plot_id)
         from expense_allocations a where a.expense_id = e.id),
      '[]'::jsonb)
  )
  from expenses e where e.id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Correcting one
-- ---------------------------------------------------------------------------
-- Takes the same payload as save_expense, so the form has one shape to build
-- and the write is one round trip. The allocation lines are replaced outright
-- rather than patched: the split is recomputed from the corrected amount, and
-- half-updated lines that briefly do not add up are exactly what the deferred
-- constraint trigger exists to allow inside a transaction.

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

  -- Replaying a queued correction must not write a second revision row. The
  -- client generates the revision id for the same reason it generates the
  -- expense id: the second attempt is a no-op.
  if revision is not null and exists (select 1 from expense_revisions where id = revision) then
    return target;
  end if;

  -- Equipment is its own register, and moving a cost in or out of it means
  -- creating or orphaning an asset. That is a bigger act than a correction, so
  -- it is refused here and done by deleting the entry and logging it again.
  if (existing.attribution = 'capital') <> (new_attr = 'capital') then
    raise exception 'an equipment purchase cannot be changed into an ordinary cost, or the other way round — delete this entry and log it again';
  end if;

  -- The freeze holds both ways. Taking a cost off a closed cycle moves a P&L
  -- the owners have already read and signed off, so it is refused with the
  -- cycle named; reopening it is a deliberate act on the cycle page.
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

  -- A capital purchase and its asset are one thing to the person who bought it,
  -- so a corrected amount or date has to reach both.
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
    insert into expense_allocations (expense_id, plot_id, cycle_id, amount_centavos)
    values (
      target,
      (alloc ->> 'plot_id')::uuid,
      coalesce(
        (alloc ->> 'cycle_id')::uuid,
        cycle_for_plot_on((alloc ->> 'plot_id')::uuid, (payload ->> 'date')::date)
      ),
      (alloc ->> 'amount_centavos')::bigint
    );
  end loop;

  return target;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deleting one
-- ---------------------------------------------------------------------------

create or replace function void_expense(p_id uuid, p_reason text, p_revision uuid default null)
returns uuid
language plpgsql as $$
declare
  existing expenses%rowtype;
  frozen   uuid;
begin
  select * into existing from expenses where id = p_id;
  if not found then
    raise exception 'no such cost %', p_id;
  end if;

  -- Already gone. A queued delete that arrives twice has done its job once.
  if existing.voided_at is not null then
    return p_id;
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'say why this entry is being deleted';
  end if;

  select a.cycle_id into frozen
    from expense_allocations a
    join crop_cycles c on c.id = a.cycle_id
   where a.expense_id = p_id and c.status = 'closed'
   limit 1;
  if frozen is not null and not importing() then
    raise exception 'cycle % is closed; its P&L is frozen', frozen;
  end if;

  insert into expense_revisions (id, expense_id, kind, before, reason, revised_by)
  values (coalesce(p_revision, gen_random_uuid()), p_id, 'void',
          expense_snapshot(p_id), btrim(p_reason), current_email())
  on conflict (id) do nothing;

  update expenses
     set voided_at = now(), voided_by = current_email(), void_reason = btrim(p_reason)
   where id = p_id;

  return p_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'update_expense(jsonb)', 'void_expense(uuid, text, uuid)', 'expense_snapshot(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;
