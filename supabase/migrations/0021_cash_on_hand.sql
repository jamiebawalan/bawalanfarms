-- ---------------------------------------------------------------------------
-- Cash on hand
-- ---------------------------------------------------------------------------
-- The manager holds cash. The owner tops it up — thirty thousand pesos at a
-- time, whenever it runs out — and everything he spends comes out of that.
--
-- In the old workbook he wrote down both sides: every peso received and every
-- peso spent. Now that he is already logging the spending as it happens, only
-- one side is left to record. So this table holds the money handed over, and
-- what is left is arithmetic rather than a second list to keep.
--
-- Every expense in the app is treated as cash. That is the farm's own
-- assumption, and it is worth stating plainly because it is the thing that
-- would make these figures wrong if it ever stopped being true.

create table if not exists cash_advances (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  amount_centavos bigint not null check (amount_centavos > 0),
  note            text,
  recorded_by     text references app_users(email),
  created_at      timestamptz not null default now(),
  constraint advance_date_in_range
    check (date >= date '2015-01-01' and date <= current_date + 1)
);

create index if not exists cash_advances_by_date on cash_advances (date desc);

comment on table cash_advances is
  'Cash handed to the farm manager. Cash on hand is the sum of these less every '
  'expense dated on or after the first one — before that there was no cash '
  'ledger, only the old workbook.';

do $$
begin
  alter table cash_advances enable row level security;
  alter table cash_advances force row level security;
  revoke all on table cash_advances from public;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on table cash_advances to authenticated;
  end if;
  drop policy if exists cash_advances_all on cash_advances;
  create policy cash_advances_all on cash_advances
    for all using (is_allowed()) with check (is_allowed());
end $$;
