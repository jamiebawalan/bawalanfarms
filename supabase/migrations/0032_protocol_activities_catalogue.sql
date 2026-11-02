-- 0032_protocol_activities_catalogue.sql — the cost vocabulary, rebuilt.
--
-- The old list of 52 grew out of the spreadsheet. It had four codes for at
-- most two weeding jobs, no code for urea, and an "Other" that became the
-- single largest line on some plots. This replaces it with activities named
-- after the protocol's own stages, so that "what did this cycle cost by
-- activity" and "what does the protocol say to do" are the same vocabulary.
--
-- Nothing is deleted. Old codes stay in the table, marked inactive, because
-- eighteen months of expenses reference them by foreign key and because a
-- recategorisation nobody can read back against the original is one nobody
-- can audit.

-- ---------------------------------------------------------------------------
-- Keeping what was written
-- ---------------------------------------------------------------------------
alter table expenses
  add column if not exists legacy_activity text,
  add column if not exists legacy_note text;

comment on column expenses.legacy_activity is
  'The activity code this expense carried before the 0033 recategorisation. '
  'Null for anything entered after it.';
comment on column expenses.legacy_note is
  'The free text an "Other" expense carried before being recategorised. Kept '
  'so the new category can always be read back against the words typed at '
  'the time.';

-- ---------------------------------------------------------------------------
-- The new vocabulary
-- ---------------------------------------------------------------------------
-- Grouped the way the protocol is, plus the four groups the protocol has no
-- opinion about but the farm still spends money on: upkeep, machines,
-- selling, and the overheads that belong to the whole farm rather than a plot.

insert into activities (code, label, activity_group, default_category, sort_order, active) values
  -- Land prep -------------------------------------------------------------
  ('soil_test',        'Soil test',                    'Land prep', 'Miscellaneous', 100, true),
  -- Clearing, ploughing, harrowing and bed-forming default to Machines
  -- because that is what they almost always are: a tractor and an operator.
  -- They are not separate "machinery" activities, though — the activity says
  -- what work was done and the category says what kind of money paid for it,
  -- so a crew doing the same job by hand is the same activity with the
  -- category switched. Two labels for one job is how deweeding ended up
  -- split across four codes.
  ('clear_crop',       'Clear the old crop',           'Land prep', 'Machines',      110, true),
  ('knockdown',        'Knockdown spray',              'Land prep', 'Labor',         120, true),
  ('amend_soil',       'Lime, dolomite or rock phosphate', 'Land prep', 'Labor',     130, true),
  ('plough',           'Plough or deep rip',           'Land prep', 'Machines',      140, true),
  ('harrow',           'Harrow',                       'Land prep', 'Machines',      150, true),
  ('drainage',         'Drainage canals',              'Land prep', 'Labor',         160, true),
  ('form_beds',        'Form the beds',                'Land prep', 'Machines',      170, true),
  -- Layout is not in the protocol and is unmistakably a job: eleven of the
  -- free-text entries name it, usually in the same breath as planting.
  ('layout',           'Layout (mark the rows)',       'Land prep', 'Labor',         180, true),

  -- Planting ---------------------------------------------------------------
  ('gather_material',  'Gather planting material',     'Planting',  'Labor',         200, true),
  ('treat_material',   'Treat planting material',      'Planting',  'Labor',         210, true),
  ('plant',            'Plant',                        'Planting',  'Labor',         220, true),
  ('replant',          'Replant the gaps',             'Planting',  'Labor',         230, true),

  -- Weeds ------------------------------------------------------------------
  -- Two jobs, not one. Tabas is cutting by hand; a chemical deweed is a
  -- sprayer. The old list had four codes for them and still sent "Chemical
  -- Deweed" and "Start tabas" to Other.
  ('pre_emergent',     'Pre-emergent spray',           'Weeds',     'Labor',         300, true),
  ('weed_spray',       'Weed spray (chemical)',        'Weeds',     'Labor',         310, true),
  ('weed_manual',      'Tabas / hand weeding',         'Weeds',     'Labor',         320, true),

  -- Nutrients --------------------------------------------------------------
  ('side_dress',       'Side-dress (granules)',        'Nutrients', 'Labor',         400, true),
  ('foliar',           'Foliar spray',                 'Nutrients', 'Labor',         410, true),

  -- Pests and disease ------------------------------------------------------
  ('ant_bait',         'Ant bait',                     'Pests',     'Labor',         500, true),
  ('pest_spray',       'Pest spray',                   'Pests',     'Labor',         510, true),
  ('scouting',         'Scouting',                     'Pests',     'Labor',         520, true),
  ('fungicide',        'Fungicide',                    'Disease',   'Labor',         600, true),

  -- Induction --------------------------------------------------------------
  ('forcing',          'Forcing',                      'Induction', 'Labor',         700, true),
  ('differentiation',  'Differentiation check',        'Induction', 'Labor',         710, true),

  -- Monitoring -------------------------------------------------------------
  ('tissue_test',      'Tissue test',                  'Monitoring','Miscellaneous', 800, true),
  ('weight_survey',    'Weight survey',                'Monitoring','Labor',         810, true),
  ('plant_count',      'Plant count',                  'Monitoring','Labor',         820, true),

  -- Harvest ----------------------------------------------------------------
  ('ripening',         'Ripening spray (pampahinog)',  'Harvest',   'Labor',         900, true),
  ('harvest',          'Harvest',                      'Harvest',   'Labor',         910, true),
  ('stack_haul',       'Stack and haul',               'Harvest',   'Farm Transport',920, true),
  ('grade',            'Grade',                        'Harvest',   'Labor',         930, true),

  -- Post-harvest -----------------------------------------------------------
  ('remove_slips',     'Remove slips',                 'Post-harvest','Labor',      1000, true),
  ('harvest_suckers',  'Harvest suckers',              'Post-harvest','Labor',      1010, true),
  ('decrown',          'Decrowning',                   'Post-harvest','Labor',      1020, true),

  -- Peanut -----------------------------------------------------------------
  -- Its own short list rather than sharing Plant and Harvest, so that "what
  -- did the rotation cost" is one glance. It is 55,000 pesos of work that had
  -- no vocabulary at all: the largest single line in "Other" was peanut seed.
  ('peanut_seed',      'Peanut seed (binhi)',          'Peanut',    'Farm Inputs',  1100, true),
  ('peanut_shell',     'Shell the seed (himay)',       'Peanut',    'Labor',        1110, true),
  ('peanut_plant',     'Plant the peanut',             'Peanut',    'Labor',        1120, true),
  ('peanut_cutback',   'Cut back (tabas mane)',        'Peanut',    'Labor',        1130, true),
  ('peanut_harvest',   'Harvest the peanut',           'Peanut',    'Labor',        1140, true),

  -- Other crops ------------------------------------------------------------
  ('other_crop_plant', 'Plant (other crop)',           'Other crops','Labor',       1200, true),
  ('other_crop_care',  'Tend (other crop)',            'Other crops','Labor',       1210, true),
  ('other_crop_harvest','Harvest (other crop)',        'Other crops','Labor',       1220, true),

  -- Upkeep -----------------------------------------------------------------
  ('plot_edges',       'Plot edges and perimeter',     'Upkeep',    'Labor',        1300, true),
  ('fetch_water',      'Fetch water (igib)',           'Upkeep',    'Labor',        1310, true),
  ('volunteer_removal','Vines and volunteers',         'Upkeep',    'Labor',        1320, true),
  ('trash',            'Trash collection',             'Upkeep',    'Labor',        1330, true),
  ('infrastructure',   'Buildings and structures',     'Upkeep',    'Miscellaneous',1340, true),

  -- Machines ---------------------------------------------------------------
  -- For tractor work that is not one of the land prep steps: hauling, a demo,
  -- a day hired for something else. Ploughing is `plough` with the category
  -- set to Machines, not this.
  ('tractor_hire',     'Tractor (other work)',         'Machines',  'Machines',     1400, true),
  ('machine_fuel',     'Fuel',                         'Machines',  'Machines',     1410, true),
  ('machine_repair',   'Repairs and parts',            'Machines',  'Machines',     1420, true),

  -- Selling ----------------------------------------------------------------
  ('haul_to_buyer',    'Haul to the buyer',            'Selling',   'Selling Transport', 1500, true),
  ('tolls',            'Tolls and trucking',           'Selling',   'Selling Transport', 1510, true),

  -- Animals ----------------------------------------------------------------
  ('animal_feed_new',  'Animal feed',                  'Animals',   'Farm Inputs',  1600, true),
  ('animal_care_new',  'Vet and care',                 'Animals',   'Miscellaneous',1610, true),

  -- Overheads --------------------------------------------------------------
  -- Farm business rather than crop. These belong to the whole farm and must
  -- not be split across plots: a ChatGPT subscription inside cost per plant
  -- is cost per plant being wrong.
  ('crew_food',        'Crew food',                    'Crew',      'Labor',        1700, true),
  ('crew_other',       'Crew other (lodging, travel)', 'Crew',      'Labor',        1710, true),
  ('admin',            'Admin, subscriptions, office', 'Overheads', 'Miscellaneous',1800, true),
  ('travel_training',  'Travel and training',          'Overheads', 'Miscellaneous',1810, true),
  ('vehicle',          'Vehicles (not farm machines)', 'Overheads', 'Machines',     1820, true)
on conflict (code) do update set
  label = excluded.label, activity_group = excluded.activity_group,
  default_category = excluded.default_category, sort_order = excluded.sort_order,
  active = true;

-- ---------------------------------------------------------------------------
-- Retiring the old vocabulary
-- ---------------------------------------------------------------------------
-- Marked inactive, never deleted. Eighteen months of expenses reference these
-- by foreign key, and the point of keeping them is that a recategorised row
-- can still be read back to the word that was originally chosen.
--
-- `other` stays active. It is the escape hatch and the schema already forces
-- a note with it. Making it harder to reach than the right field is a change
-- to the entry screen, not to this table.
--
-- Seven codes also stay active because nobody has yet said what they mean or
-- which new activity they are: spray (herbicide, pesticide or foliar?),
-- liquid, stab_drop, pinya_trimming, material_collection, fruiting_formula,
-- and the generic land_prep. Retiring a code whose meaning is unsettled
-- would strand the expenses that use it.

update activities set active = false
where code in (
  'abono', 'deweed', 'pakyaw_deweed', 'tabas',
  'tabas_mane', 'vine_removal', 'kill_saging',
  'decrowning', 'igib',
  'araro', 'plot_clearing', 'plot_edging', 'tanim',
  'pinya_planting', 'banana_planting', 'corn_planting', 'coffee_planting',
  'suwe_gathering', 'hakot_material',
  'harvesting', 'kalakal', 'kamada', 'lalamove', 'trucking', 'toll_gate',
  'fert_21_0_0', 'fert_16_20_0', 'fert_0_0_60',
  'ethrel', 'onecide', 'diuron', 'agroxone', 'herbicides', 'insecticides',
  'food',
  'tractor', 'hakot_farm', 'fuel_farm', 'barang', 'araro_repair',
  'diesel', 'mechanic',
  'animal_feed', 'animal_care_vet'
);
