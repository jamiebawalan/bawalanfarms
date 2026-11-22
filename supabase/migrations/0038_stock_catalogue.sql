-- 0038_stock_catalogue.sql — the shed, in the protocol's own words.
--
-- Three problems with the list of things Anthony can buy.
--
-- 1. It is one flat run of thirty chips. He is in a field holding a phone in
--    one hand. Fertiliser and weedkiller should not be next to each other.
-- 2. The names are the spreadsheet's, not the protocol's. The protocol says
--    "muriate of potash"; the chip says "Fertilizer 0-0-60"; the sack in the
--    shed says both. A name that matches only one of the three is the one
--    that gets mis-picked.
-- 3. Five rows are offered that the protocol never prescribes, four of which
--    are placeholders from the old book ("Herbicide (other)").
--
-- Grouping lives on input_types rather than being joined from materials.kind
-- because it is a property of the shed, not of the protocol: Agroxone is real
-- stock the farm carries and the protocol does not mention it, so a join
-- would leave it in no group at all.

alter table input_types
  add column if not exists category text;

update input_types t set category = case m.kind
    when 'fertiliser'  then 'care'
    when 'foliar'      then 'care'
    when 'amendment'   then 'care'
    when 'herbicide'   then 'protection'
    when 'insecticide' then 'protection'
    when 'fungicide'   then 'protection'
    when 'other'       then 'forcing'
  end
  from materials m
 where m.input_type = t.code and t.category is null;

-- Agroxone is paraquat (see 0031). The protocol does not prescribe it, but the
-- farm carries it, so it is grouped by hand.
update input_types set category = 'protection'
 where code = 'agroxone' and category is null;

-- Anything still ungrouped is a row we are about to retire; park it rather
-- than block the constraint, so the column can be not-null from here on.
update input_types set category = 'care' where category is null;

alter table input_types
  alter column category set not null;

alter table input_types
  drop constraint if exists input_type_category_known;
alter table input_types
  add constraint input_type_category_known
    check (category in ('care', 'protection', 'forcing'));

comment on column input_types.category is
  'Which shelf of the shed: care (feeding the crop), protection (spraying '
  'against weeds, insects and disease), forcing (making it flower).';

-- ---------------------------------------------------------------------------
-- The protocol's names, with the analysis kept
-- ---------------------------------------------------------------------------
-- Both halves matter. "Muriate of potash" is what the protocol and the
-- husband call it; "0-0-60" is what is printed on the sack Anthony is looking
-- at. Dropping either one would make somebody guess.

update input_types set label = v.label from (values
  ('fert_0_0_60',  'Muriate of potash (0-0-60)'),
  ('fert_21_0_0',  'Ammonium sulfate (21-0-0)'),
  ('urea',         'Urea (46-0-0)'),
  ('dap',          'DAP (18-46-0)'),
  ('ethrel',       'Ethrel (ethephon)'),
  ('glyphosate',   'Glyphosate (Round-up)'),
  ('onecide',      'Onecide (fluazifop)'),
  ('agroxone',     'Agroxone (paraquat)')
) as v(code, label) where input_types.code = v.code;

-- ---------------------------------------------------------------------------
-- Retiring what the protocol never asks for
-- ---------------------------------------------------------------------------
-- Retiring hides a row from the buy screen. It does NOT touch stock already
-- bought under it: existing lots stay on the Stock screen and can still be
-- drawn down or sold off until they are empty. To bring one back:
--
--   update input_types set active = true where code = 'fruiting_formula';
--
-- "Herbicide (other)" and "Insecticide (other)" are placeholders carried over
-- from the spreadsheet — a chip that names no chemical cannot be dosed, and a
-- cost filed under it says nothing a year later.
--
-- 16-20-0 and Fruiting Formula are real blends, but the protocol prescribes
-- neither: it builds the same nutrition from the straights above. If the farm
-- buys them again, re-activate rather than creating a second row.

update input_types set active = false
 where code in ('fert_16_20_0', 'fruiting_formula', 'herbicide_other', 'insecticide_other');
