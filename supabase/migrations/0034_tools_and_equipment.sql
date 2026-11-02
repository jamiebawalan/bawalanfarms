-- 0034_tools_and_equipment.sql — somewhere for the implements to go.
--
-- A chainsaw, a mower, two garden hoes, a knapsack sprayer, a weighing scale:
-- about ₱16,000 of equipment that went to "Other" because the list had no
-- word for a thing you buy once and keep using.
--
-- It is one activity whichever way a particular purchase is treated. A
-- chainsaw at ₱2,400 is worth carrying as an asset across the cycles that use
-- it; a ₱750 garden hoe depreciated over sixty months is ₱12.50 a month of
-- administration for no insight, and is better expensed. Both are "tools and
-- equipment" — the difference is the attribution, not the activity.

insert into activities (code, label, activity_group, default_category, sort_order, active)
values ('tools_equipment', 'Tools and equipment', 'Machines', 'Machines', 1430, true)
on conflict (code) do update set
  label = excluded.label, activity_group = excluded.activity_group,
  default_category = excluded.default_category, sort_order = excluded.sort_order,
  active = true;
