-- 0023_animal_costs.sql — logging what the animals cost, in three taps.
--
-- The farm keeps working animals and dogs, and feeding them is an ordinary
-- weekly cost. But there was no activity for it. To log a sack of feed the
-- farm manager had to pick "Other" — which demands a typed note — then choose
-- "Whole farm", then choose the reason "Animal care". Four decisions and a
-- sentence of typing, for a cost that is the same every time.
--
-- The attribution was never in doubt. An animal is not on a plot, and feeding
-- one is not a cost any single cycle should carry; that is why the whole-farm
-- reason 'animal_care' has existed since the beginning, and why the historical
-- import routes "animal", "dog" and "carabao" straight to it.
--
-- So the activity now carries the answer with it. Pick "Animal Feed" and the
-- form already knows it is whole-farm animal care, and asks nothing further.

alter table activities
  add column if not exists implies_farm_wide_reason farm_wide_reason;

comment on column activities.implies_farm_wide_reason is
  'When set, choosing this activity settles the attribution: the cost is '
  'whole-farm for this reason, and the form stops asking. The person can still '
  'override it.';

insert into activities (code, label, activity_group, default_category, sort_order,
                        implies_farm_wide_reason) values
  ('animal_feed','Animal Feed','Animals','Farm Inputs',800,'animal_care'),
  ('animal_care_vet','Animal Care / Vet','Animals','Miscellaneous',810,'animal_care')
on conflict (code) do update
  set label                    = excluded.label,
      activity_group           = excluded.activity_group,
      default_category         = excluded.default_category,
      sort_order               = excluded.sort_order,
      implies_farm_wide_reason = excluded.implies_farm_wide_reason;
