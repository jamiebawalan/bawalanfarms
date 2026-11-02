-- 0033_recategorise_history.sql — eighteen months onto the new vocabulary.
--
-- Only the mappings where one old code means exactly one new activity. The
-- free text under "Other" is not touched here: it needs reading, and it gets
-- a review queue rather than a guess.
--
-- WHAT THIS DOES NOT CHANGE: the category. An expense carries two facts — the
-- kind of money (Labour, Farm Inputs, Machines) and the work it was for. A
-- sack of 0-0-60 and the morning spent spreading it are both "Nutrients ·
-- Side-dress"; one is Farm Inputs and the other is Labour, and that pairing
-- is the whole point of having two axes. Rewriting the category here would
-- turn every fertiliser purchase into a labour cost.
--
-- The single exception is Food, which was filed under Farm Inputs. Feeding
-- the crew is a real cost and belongs in the P&L, but counting it as an input
-- makes input cost per plant wrong — and that is the figure the protocol work
-- exists to improve. It moves to Labour.

-- Every row keeps the code it carried, so the new category can always be
-- read back against what was actually chosen at the time.
update expenses e set
  legacy_activity = e.activity,
  activity        = m.to_activity
from (values
  -- Land prep and planting
  -- Araro is not remapped. It survives as its own activity, because on this
  -- farm it has always been carabao work and that is a shallower operation
  -- than either the ripper or a moldboard, not the same job with a different
  -- engine. Its history is already filed correctly.
  ('plot_clearing',    'clear_crop'),
  ('plot_edging',      'plot_edges'),
  ('tanim',            'plant'),
  ('pinya_planting',   'plant'),
  ('banana_planting',  'other_crop_plant'),
  ('corn_planting',    'other_crop_plant'),
  ('coffee_planting',  'other_crop_plant'),
  ('suwe_gathering',   'gather_material'),
  ('hakot_material',   'gather_material'),

  -- Crop care. Tabas is cutting by hand; the chemical jobs are sprays. The
  -- old list had four codes for what turned out to be one manual job.
  ('abono',            'side_dress'),
  ('deweed',           'weed_manual'),
  ('pakyaw_deweed',    'weed_manual'),
  ('tabas',            'weed_manual'),
  ('vine_removal',     'volunteer_removal'),
  ('kill_saging',      'volunteer_removal'),
  ('igib',             'fetch_water'),
  ('decrowning',       'decrown'),

  -- Peanut. "Mane" is mani: the rotation crop, not a pineapple job.
  ('tabas_mane',       'peanut_cutback'),

  -- Harvest and selling
  ('harvesting',       'harvest'),
  ('kamada',           'stack_haul'),
  ('hakot_farm',       'stack_haul'),
  ('kalakal',          'haul_to_buyer'),
  ('lalamove',         'haul_to_buyer'),
  ('trucking',         'tolls'),
  ('toll_gate',        'tolls'),

  -- Materials. These stay Farm Inputs; only the work they belong to changes.
  ('fert_21_0_0',      'side_dress'),
  ('fert_16_20_0',     'side_dress'),
  ('fert_0_0_60',      'side_dress'),
  ('ethrel',           'forcing'),
  ('onecide',          'weed_spray'),
  ('diuron',           'weed_spray'),
  ('agroxone',         'weed_spray'),
  ('herbicides',       'weed_spray'),
  ('insecticides',     'pest_spray'),
  ('food',             'crew_food'),

  -- Machines
  ('tractor',          'tractor_hire'),
  ('fuel_farm',        'machine_fuel'),
  ('diesel',           'machine_fuel'),
  ('barang',           'machine_repair'),
  ('araro_repair',     'machine_repair'),
  ('mechanic',         'machine_repair'),

  -- Animals
  ('animal_feed',      'animal_feed_new'),
  ('animal_care_vet',  'animal_care_new')
) as m(from_activity, to_activity)
where e.activity = m.from_activity
  and e.legacy_activity is null;

-- Pakyaw is a way of paying, not a job. The row already has a column for it,
-- and the old code recorded the same fact twice while splitting the number
-- for deweeding across two lines.
update expenses
set labour_mode = 'pakyaw'
where legacy_activity = 'pakyaw_deweed'
  and category = 'Labor'
  and labour_mode is null;

-- Food was an input next to the fertiliser. It is a crew cost.
update expenses
set category = 'Labor'
where legacy_activity = 'food'
  and category = 'Farm Inputs';
