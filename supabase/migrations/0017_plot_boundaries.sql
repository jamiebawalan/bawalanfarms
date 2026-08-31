-- ---------------------------------------------------------------------------
-- Where each plot actually is
-- ---------------------------------------------------------------------------
-- Boundaries traced in Google Earth and exported as KML. Stored as plain
-- longitude/latitude rings rather than PostGIS geometry: the farm has
-- twenty-seven polygons of a dozen points each, the app only ever draws them
-- and measures them, and a whole spatial extension to do that would be a large
-- dependency bought for nothing.
--
-- A plot can have more than one ring. Plot 11 is two parcels on the ground that
-- the app still holds as one plot, so it gets two rows — which also means that
-- when 11 is finally split, each ring simply moves to its own plot rather than
-- having to be redrawn.

create table if not exists plot_boundaries (
  id         uuid primary key default gen_random_uuid(),
  plot_id    uuid not null references plots(id) on delete cascade,
  part       text not null default 'main',
  -- [[lon, lat], [lon, lat], ...], closed ring, WGS84.
  ring       jsonb not null,
  -- Area computed from the ring itself. Kept so the app can show where a
  -- surveyed figure and the drawn shape disagree, instead of quietly trusting
  -- whichever it happened to read first.
  area_sqm   numeric(10,1) not null check (area_sqm > 0),
  source     text,
  updated_at timestamptz not null default now(),
  unique (plot_id, part),
  constraint ring_is_a_ring check (jsonb_array_length(ring) >= 4)
);

create index if not exists plot_boundaries_by_plot on plot_boundaries (plot_id);

do $$
begin
  alter table plot_boundaries enable row level security;
  alter table plot_boundaries force row level security;
  revoke all on table plot_boundaries from public;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on table plot_boundaries to authenticated;
  end if;
  drop policy if exists plot_boundaries_read on plot_boundaries;
  create policy plot_boundaries_read on plot_boundaries
    for select using (is_allowed());
end $$;
