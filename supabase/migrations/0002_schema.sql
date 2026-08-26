-- 0002_schema.sql — core tables.
--
-- Money is stored as integer centavos everywhere (`*_centavos`). Never float.
-- Quantities are numeric(14,3) — sacks, kilos and litres are all fractional.

-- ---------------------------------------------------------------------------
-- People and access
-- ---------------------------------------------------------------------------

create table app_users (
  email       text primary key check (email = lower(email)),
  role        app_role not null default 'manager',
  display_name text not null,
  created_at  timestamptz not null default now()
);

-- The person responsible for a plot ("mayor"). Separate from app_users because
-- some mayors ("Farm People") never log in.
create table people (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Plots
-- ---------------------------------------------------------------------------

create table plots (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- '1'..'26', 'Mango', '27'
  label       text not null,                 -- 'Plot 1', 'Mango', 'Coffee (27)'
  sort_order  integer not null,
  -- The Mango plot is excluded from the farm-wide overhead pool by the owner's
  -- choice. Kept as a flag so it is one row-edit to reverse, not a code change.
  shares_overhead boolean not null default true,
  active      boolean not null default true,
  notes       text
);

-- Areas change rarely but must be editable with an effective date, so the split
-- of a 2024 expense keeps using the 2024 area even after a re-survey.
create table plot_areas (
  id             uuid primary key default gen_random_uuid(),
  plot_id        uuid not null references plots(id) on delete cascade,
  effective_from date not null,
  area_sqm       numeric(12,2) not null check (area_sqm > 0),
  note           text,
  unique (plot_id, effective_from)
);
create index plot_areas_lookup on plot_areas (plot_id, effective_from desc);

-- Shared plots ("Jamie/Joanne") are two rows, not a compound string.
create table plot_mayors (
  plot_id        uuid not null references plots(id) on delete cascade,
  person_id      uuid not null references people(id) on delete restrict,
  effective_from date not null default current_date,
  primary key (plot_id, person_id, effective_from)
);

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

create table crops (
  code   text primary key,
  label  text not null,
  active boolean not null default true
);

-- Activities are a table rather than an enum so the family can add a term
-- without a migration. The UI still refuses free text: an unlisted activity
-- must be logged as 'other' with a mandatory note, which the owners review.
create table activities (
  code           text primary key,
  label          text not null,
  activity_group text not null,   -- 'Land & planting', 'Crop care', ...
  -- The category this activity almost always belongs to. Used to pre-fill the
  -- category so the farm manager taps one field instead of two.
  default_category expense_category,
  sort_order     integer not null default 0,
  active         boolean not null default true
);

create table buyers (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  active boolean not null default true
);

-- Pineapple grades are ordered (Primera is best). Non-pineapple crops sell by
-- product name through the same column, so `is_grade` separates the two.
create table products (
  code       text primary key,        -- 'primera', 'lakatan', ...
  label      text not null,
  sort_order integer not null,
  is_grade   boolean not null default false,  -- true = pineapple grade
  active     boolean not null default true
);

create table input_types (
  code       text primary key,
  label      text not null,
  unit       text not null default 'sack',
  -- 50kg sacks, dosed at 40g per plant. Lets the app suggest a draw quantity
  -- from the latest plant count instead of him working it out by hand.
  kg_per_unit numeric(10,3),
  active     boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Crop cycles — the entity P&L attaches to
-- ---------------------------------------------------------------------------

create table crop_cycles (
  id            uuid primary key default gen_random_uuid(),
  plot_id       uuid not null references plots(id) on delete restrict,
  crop          text not null references crops(code),
  status        cycle_status not null default 'planned',
  date_started  date,
  date_planted  date,
  date_closed   date,
  planting_material_source text,
  -- Set when the plot is worked by a tenant sharecropper. See DECISIONS.md:
  -- the tenant's share is recorded as a cost line at close, not as lost revenue.
  kasama_share_pct numeric(5,2) check (kasama_share_pct >= 0 and kasama_share_pct <= 100),
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    text references app_users(email),

  constraint closed_iff_date_closed
    check ((status = 'closed') = (date_closed is not null)),
  constraint planted_after_started
    check (date_planted is null or date_started is null or date_planted >= date_started),
  constraint closed_after_planted
    check (date_closed is null or date_started is null or date_closed >= date_started)
);

-- THE rule: a plot can only have one live cycle at a time. Enforced in the
-- database, not the application, so an import or a stray script cannot break it.
create unique index one_active_cycle_per_plot
  on crop_cycles (plot_id)
  where status not in ('closed', 'planned');

-- ...and at most one cycle queued behind it. The family is doing this right now:
-- peanuts harvesting on plots already planned for pineapple.
create unique index one_planned_cycle_per_plot
  on crop_cycles (plot_id)
  where status = 'planned';

create index crop_cycles_plot on crop_cycles (plot_id, date_started desc);

-- Plant counts go stale and get recounted. Never overwritten: the count used
-- for a February dose is the count as of February, not today's.
create table plant_count_observations (
  id         uuid primary key default gen_random_uuid(),
  cycle_id   uuid not null references crop_cycles(id) on delete cascade,
  date       date not null,
  count      integer not null check (count >= 0),
  note       text,
  created_at timestamptz not null default now(),
  unique (cycle_id, date)
);
create index plant_counts_lookup on plant_count_observations (cycle_id, date desc);

-- ---------------------------------------------------------------------------
-- Capital assets (excluded from cycle P&L, depreciated separately)
-- ---------------------------------------------------------------------------

create table capital_assets (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  purchase_date     date not null,
  cost_centavos     bigint not null check (cost_centavos > 0),
  useful_life_months integer not null default 60 check (useful_life_months > 0),
  disposed_on       date,
  note              text
);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create table expenses (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  category      expense_category not null,
  activity      text not null references activities(code),
  -- 'other' is the only escape from the vocabulary, and it demands a note.
  activity_other_note text,
  attribution   expense_attribution not null,
  farm_wide_reason farm_wide_reason,
  capital_asset_id uuid references capital_assets(id) on delete set null,
  labour_mode   labour_mode,
  unit_price_centavos bigint check (unit_price_centavos >= 0),
  quantity      numeric(14,3) check (quantity > 0),
  amount_centavos bigint not null check (amount_centavos >= 0),
  paid_to       text,
  photo_path    text,
  note          text,
  -- Set by the import so a corrected file can be re-imported without duplicating.
  import_key    text unique,
  created_at    timestamptz not null default now(),
  created_by    text references app_users(email),

  -- Rule 7: amounts are computed, never typed twice.
  constraint amount_matches_unit_maths check (
    unit_price_centavos is null or quantity is null
    or amount_centavos = round(unit_price_centavos * quantity)
  ),
  -- Rule 2: the vocabulary escape hatch is not a free-text field by the back door.
  constraint other_activity_needs_note check (
    activity <> 'other' or (activity_other_note is not null and length(btrim(activity_other_note)) > 2)
  ),
  -- Rule 5: farm-wide requires a reason; everything else must not carry one.
  constraint farm_wide_needs_reason check (
    (attribution = 'farm_wide') = (farm_wide_reason is not null)
  ),
  constraint capital_needs_asset check (
    attribution <> 'capital' or capital_asset_id is not null
  ),
  constraint labour_mode_only_for_labor check (
    labour_mode is null or category = 'Labor'
  ),
  -- Rule 6, storage-layer backstop: nine rows in the old book were dated a year
  -- late. The UI asks for confirmation past today; the database refuses anything
  -- more than a month out, or older than the farm's records.
  constraint date_in_plausible_range check (
    date >= date '2015-01-01' and date <= current_date + 30
  )
);
create index expenses_date on expenses (date desc);
create index expenses_category on expenses (category, date desc);
create index expenses_activity on expenses (activity, date desc);

-- The materialised split. Written at save time from the preview the farm manager
-- saw and confirmed, so what is stored is exactly what he approved — and he can
-- override an area split line without the app silently recomputing it.
create table expense_allocations (
  id              uuid primary key default gen_random_uuid(),
  expense_id      uuid not null references expenses(id) on delete cascade,
  plot_id         uuid not null references plots(id) on delete restrict,
  -- Null when no cycle was open on that plot at that date. The cost still
  -- belongs to the plot; the "unattached costs" report surfaces these rather
  -- than letting them disappear.
  cycle_id        uuid references crop_cycles(id) on delete set null,
  amount_centavos bigint not null check (amount_centavos >= 0),
  unique (expense_id, plot_id)
);
create index expense_alloc_cycle on expense_allocations (cycle_id);
create index expense_alloc_plot on expense_allocations (plot_id);

-- ---------------------------------------------------------------------------
-- Input inventory
-- ---------------------------------------------------------------------------
-- The single largest failure of the old system: PHP 275,000 of fertiliser bought
-- as one lot of 250 sacks, consumed across many plots over months, attributed to
-- none of them. Buying is not a cost. Drawing is.

create table input_purchases (
  id                uuid primary key default gen_random_uuid(),
  date              date not null,
  input_type        text not null references input_types(code),
  quantity          numeric(14,3) not null check (quantity > 0),
  unit              text not null,
  unit_cost_centavos bigint not null check (unit_cost_centavos >= 0),
  total_centavos    bigint not null check (total_centavos >= 0),
  supplier          text,
  note              text,
  import_key        text unique,
  created_at        timestamptz not null default now(),
  created_by        text references app_users(email),
  constraint total_matches_unit_maths
    check (total_centavos = round(unit_cost_centavos * quantity)),
  constraint purchase_date_in_range
    check (date >= date '2015-01-01' and date <= current_date + 30)
);
create index input_purchases_type on input_purchases (input_type, date desc);

create table input_draws (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references input_purchases(id) on delete restrict,
  cycle_id    uuid not null references crop_cycles(id) on delete restrict,
  date        date not null,
  quantity    numeric(14,3) not null check (quantity > 0),
  dose_note   text,
  import_key  text unique,
  created_at  timestamptz not null default now(),
  created_by  text references app_users(email),
  constraint draw_date_in_range
    check (date >= date '2015-01-01' and date <= current_date + 30)
);
create index input_draws_purchase on input_draws (purchase_id);
create index input_draws_cycle on input_draws (cycle_id, date);

-- ---------------------------------------------------------------------------
-- Harvest and sale — separate events, deliberately
-- ---------------------------------------------------------------------------
-- Fruit is picked, then sold: sometimes days later, sometimes to several buyers.
-- Harvested-minus-sold is spoilage or giveaway, and the reports show that gap.

create table harvests (
  id         uuid primary key default gen_random_uuid(),
  cycle_id   uuid not null references crop_cycles(id) on delete cascade,
  date       date not null,
  note       text,
  import_key text unique,
  created_at timestamptz not null default now(),
  created_by text references app_users(email),
  constraint harvest_date_in_range
    check (date >= date '2015-01-01' and date <= current_date + 30)
);
create index harvests_cycle on harvests (cycle_id, date);

create table harvest_lines (
  id         uuid primary key default gen_random_uuid(),
  harvest_id uuid not null references harvests(id) on delete cascade,
  product    text not null references products(code),
  quantity   numeric(14,3) not null check (quantity > 0),
  unique (harvest_id, product)
);

create table sales (
  id         uuid primary key default gen_random_uuid(),
  cycle_id   uuid not null references crop_cycles(id) on delete restrict,
  buyer_id   uuid not null references buyers(id) on delete restrict,
  date       date not null,
  note       text,
  import_key text unique,
  created_at timestamptz not null default now(),
  created_by text references app_users(email),
  constraint sale_date_in_range
    check (date >= date '2015-01-01' and date <= current_date + 30)
);
create index sales_cycle on sales (cycle_id, date);
create index sales_buyer on sales (buyer_id, date desc);

create table sale_lines (
  id                  uuid primary key default gen_random_uuid(),
  sale_id             uuid not null references sales(id) on delete cascade,
  product             text not null references products(code),
  quantity            numeric(14,3) not null check (quantity > 0),
  -- Price is captured per line, every time. In the real data Primera sold at
  -- PHP 70, 65 and 60 within eleven days at different markets: there is no
  -- price tier to look up, only a last-price default the seller can overwrite.
  unit_price_centavos bigint not null check (unit_price_centavos >= 0),
  total_centavos      bigint not null check (total_centavos >= 0),
  -- Marks a lot dumped cheap rather than sold at grade, so it can be excluded
  -- from realised-price averages instead of dragging them down.
  is_bulk             boolean not null default false,
  constraint line_total_matches_unit_maths
    check (total_centavos = round(unit_price_centavos * quantity))
);
create index sale_lines_sale on sale_lines (sale_id);
create index sale_lines_product on sale_lines (product);
