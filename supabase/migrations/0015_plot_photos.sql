-- ---------------------------------------------------------------------------
-- Plot photos
-- ---------------------------------------------------------------------------
-- The picture goes to Google Drive, into the folder for the cycle it belongs
-- to, where the owners can find it without this app. What stays here is only
-- what the app needs to show it back: which cycle, which day, and the Drive id
-- to fetch it by.
--
-- The image itself is deliberately not in Postgres. A season of field photos is
-- gigabytes, the database is the farm's books, and the two have very different
-- reasons to exist.

create table if not exists plot_photos (
  id            uuid primary key default gen_random_uuid(),
  cycle_id      uuid not null references crop_cycles(id) on delete cascade,
  taken_on      date not null,
  drive_file_id text not null,
  caption       text,
  bytes         integer,
  created_at    timestamptz not null default now(),
  created_by    text references app_users(email),
  constraint photo_date_in_range
    check (taken_on >= date '2015-01-01' and taken_on <= current_date + 1)
);

create index if not exists plot_photos_by_cycle
  on plot_photos (cycle_id, taken_on desc);

do $$
begin
  alter table plot_photos enable row level security;
  alter table plot_photos force row level security;
  revoke all on table plot_photos from public;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on table plot_photos to authenticated;
  end if;
  drop policy if exists plot_photos_all on plot_photos;
  create policy plot_photos_all on plot_photos
    for all using (is_allowed()) with check (is_allowed());
end $$;
