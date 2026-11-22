-- 0039_planting_material.sql — where the suckers came from, and what they cost.
--
-- A plot planted from suckers bought off another farmer costs money a plot
-- planted from our own does not. Until now both landed in the same place and
-- the difference was invisible, which matters because it is one of the few
-- planting decisions that is genuinely ours to make each cycle.
--
-- Two activities, on the two axes already in use.
--
--   Bought:  buy_material   (Farm Inputs — cash out to another farm)
--            prep_material  (Labor)
--
--   Our own: gather_material (Labor — already here; collecting our suckers)
--            prep_material   (Labor)
--
-- So own-sourced material has no cash line at all, which is the truth: it is
-- free, and the only thing it costs is the labour of handling it. The two
-- routes are then comparable on the one screen, and "we should have bought"
-- or "we should have saved our own" becomes a number instead of a feeling.
--
-- prep_material is ONE activity, not three. Sorting, cutting and packaging
-- happen in one session at the same pile; three chips would be three chances
-- to file the same afternoon's work under three different words, and three
-- numbers that cannot be added up afterwards. The label names all three so he
-- recognises it whichever part he is doing.

insert into activities (code, label, activity_group, default_category, sort_order, active)
values
  ('buy_material',  'Buy planting material',             'Planting', 'Farm Inputs', 195, true),
  ('prep_material', 'Prepare material (sort, cut, pack)', 'Planting', 'Labor',       205, true)
on conflict (code) do update set
  label            = excluded.label,
  activity_group   = excluded.activity_group,
  default_category = excluded.default_category,
  sort_order       = excluded.sort_order,
  active           = excluded.active;

comment on table activities is
  'What the money was for. Paired with expenses.category, which says what '
  'kind of money it was. Anything describing HOW work was done or paid for '
  'belongs on an existing axis, never as a new activity.';
