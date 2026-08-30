-- ---------------------------------------------------------------------------
-- Google Drive: where the farm's own copy of everything lives
-- ---------------------------------------------------------------------------
-- The app writes a folder per plot, a folder per cycle inside it, and a
-- readable markdown history in each. The point is that the record survives the
-- app: if this whole thing disappears tomorrow, the farm still has its own
-- files, in its own Drive, readable on any phone.
--
-- This has to be user OAuth rather than the service account that drives the
-- Sheets mirror. A service account has no Drive storage of its own and cannot
-- create files in a personal Google account — Google's answer is a Shared
-- Drive or domain delegation, both of which need Workspace, and the farm runs
-- on a personal Gmail. Authorising as the owner also puts the files where they
-- belong: owned by her, counting against her storage, hers if the app goes.

create table if not exists google_auth (
  id            boolean primary key default true check (id),
  refresh_token text not null,
  root_folder_id text,
  connected_by  text references app_users(email),
  connected_at  timestamptz not null default now(),
  last_mirror_at timestamptz,
  last_error    text
);

comment on table google_auth is
  'One row. The owner''s Google refresh token and the id of the farm''s root '
  'Drive folder. The primary key is a constant so a second row cannot exist.';

-- Where each cycle's folder and history file ended up, so a second mirror
-- updates them instead of creating a duplicate beside them. Drive is happy to
-- hold two files with the same name in the same folder, which makes remembering
-- the id the only reliable way to be idempotent.
create table if not exists drive_files (
  kind       text not null check (kind in ('plot_folder', 'cycle_folder', 'history', 'photo', 'doc')),
  ref        text not null,
  file_id    text not null,
  name       text not null,
  updated_at timestamptz not null default now(),
  primary key (kind, ref)
);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- The refresh token is a credential: it stays with the owners, and nobody
-- reads it through the API at all. Only the server, holding the service-role
-- key, ever touches google_auth.
do $$
begin
  alter table google_auth enable row level security;
  alter table google_auth force row level security;
  revoke all on table google_auth from public;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table google_auth from authenticated;
  end if;

  alter table drive_files enable row level security;
  alter table drive_files force row level security;
  revoke all on table drive_files from public;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on table drive_files to authenticated;
  end if;
  drop policy if exists drive_files_read on drive_files;
  create policy drive_files_read on drive_files for select using (is_allowed());
end $$;
