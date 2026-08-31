-- 0004_seed.sql — reference data. Idempotent: safe to re-run.

insert into people (name) values
  ('Jamie'), ('Jose'), ('Anne'), ('Tony'), ('Joanne'), ('Farm People')
on conflict (name) do nothing;

-- Plots 1-26 with surveyed areas, plus Mango and the coffee plot.
insert into plots (code, label, sort_order, shares_overhead, notes) values
  ('1','Plot 1',1,true,null),   ('2','Plot 2',2,true,null),
  ('3','Plot 3',3,true,null),   ('4','Plot 4',4,true,null),
  ('5','Plot 5',5,true,null),   ('6','Plot 6',6,true,null),
  ('7','Plot 7',7,true,null),   ('8','Plot 8',8,true,null),
  ('9','Plot 9',9,true,null),   ('10','Plot 10',10,true,null),
  ('11','Plot 11',11,true,null),('12','Plot 12',12,true,null),
  ('13','Plot 13',13,true,null),('14','Plot 14',14,true,null),
  ('15','Plot 15',15,true,null),
  ('16','Plot 16',16,true,'Kasama (tenant sharecropper) — see cycle kasama_share_pct'),
  ('17','Plot 17',17,true,null),('18','Plot 18',18,true,null),
  ('19','Plot 19',19,true,null),('20','Plot 20',20,true,null),
  ('21','Plot 21',21,true,null),('22','Plot 22',22,true,null),
  ('23','Plot 23',23,true,null),('24','Plot 24',24,true,null),
  ('25','Plot 25',25,true,null),('26','Plot 26',26,true,null),
  -- Excluded from the farm-wide overhead pool by the owner's choice.
  ('Mango','Mango',27,false,'Excluded from farm-wide overhead allocation by the owner''s choice'),
  ('27','Coffee (27)',28,true,'Area not yet surveyed — excluded from area-weighted splits until set')
on conflict (code) do nothing;

-- Areas as surveyed. Effective from before any farm record, so every historical
-- expense finds an area to split on.
insert into plot_areas (plot_id, effective_from, area_sqm, note)
select p.id, date '2015-01-01', v.area, 'Initial survey'
from (values
  ('1',6364),('2',5651),('3',3468),('4',4200),('5',4228),('6',7370),('7',7775),('8',8376),
  ('9',1984),('10',2942),('11',7536),('12',3258),('13',2075),('14',6180),('15',3208),('16',2711),
  ('17',5537),('18',3854),('19',3273),('20',2722),('21',3673),('22',3872),('23',3031),('24',3631),
  ('25',6765),('26',4466),('Mango',3630)
) as v(code, area)
join plots p on p.code = v.code
on conflict (plot_id, effective_from) do nothing;
-- Coffee (27) deliberately has no area row. See DECISIONS.md, open question 1.

-- Guard the seed against a typo: plots 1-26 must total 118,150 sqm.
do $$
declare total numeric;
begin
  select sum(a.area_sqm) into total
  from plot_areas a join plots p on p.id = a.plot_id
  where p.code ~ '^[0-9]+$' and p.code::int between 1 and 26;
  if total <> 118150 then
    raise exception 'plot areas 1-26 total % sqm, expected 118150', total;
  end if;
end $$;

insert into crops (code, label) values
  ('pineapple','Pineapple'), ('peanut','Peanut'), ('banana','Banana'),
  ('mane','Mane'), ('corn','Corn'), ('coffee','Coffee'),
  ('mango','Mango'), ('papaya','Papaya')
on conflict (code) do nothing;

-- The family's own words. He thinks in these, not in English accounting labels.
insert into activities (code, label, activity_group, default_category, sort_order) values
  ('araro','Araro (plough)','Land & planting','Labor',10),
  ('land_prep','Land Prep','Land & planting','Labor',20),
  ('plot_clearing','Plot Clearing','Land & planting','Labor',30),
  ('plot_edging','Plot Edging','Land & planting','Labor',40),
  ('tanim','Tanim (plant)','Land & planting','Labor',50),
  ('pinya_planting','Pinya Planting','Land & planting','Labor',60),
  ('banana_planting','Banana Planting','Land & planting','Labor',70),
  ('corn_planting','Corn Planting','Land & planting','Labor',80),
  ('coffee_planting','Coffee Planting','Land & planting','Labor',90),
  ('suwe_gathering','Suwe / Planting Material Gathering','Land & planting','Labor',100),
  ('hakot_material','Hakot Planting Material','Land & planting','Labor',110),
  ('material_collection','Material Collection','Land & planting','Labor',120),

  ('abono','Abono / Fertilizer Application','Crop care','Labor',200),
  ('stab_drop','Stab-Drop','Crop care','Labor',210),
  ('spray','Spray','Crop care','Labor',220),
  ('deweed','Deweed','Crop care','Labor',230),
  ('pakyaw_deweed','Pakyaw Deweed','Crop care','Labor',240),
  ('tabas','Tabas (cut back)','Crop care','Labor',250),
  ('tabas_mane','Tabas Mane','Crop care','Labor',260),
  ('vine_removal','Vine Removal','Crop care','Labor',270),
  ('kill_saging','Kill Saging','Crop care','Labor',280),
  ('pinya_trimming','Pinya Trimming','Crop care','Labor',290),
  ('decrowning','Decrowning','Crop care','Labor',300),
  ('liquid','Liquid','Crop care','Labor',310),
  ('igib','Igib (fetch water)','Crop care','Labor',320),

  ('fert_21_0_0','Fertilizer 21-0-0','Inputs','Farm Inputs',400),
  ('fert_16_20_0','Fertilizer 16-20-0','Inputs','Farm Inputs',410),
  ('fert_0_0_60','Fertilizer 0-0-60','Inputs','Farm Inputs',420),
  ('fruiting_formula','Fruiting Formula','Inputs','Farm Inputs',430),
  ('ethrel','Ethrel','Inputs','Farm Inputs',440),
  ('onecide','Onecide','Inputs','Farm Inputs',450),
  ('diuron','Diuron','Inputs','Farm Inputs',460),
  ('agroxone','Agroxone','Inputs','Farm Inputs',470),
  ('herbicides','Herbicides','Inputs','Farm Inputs',480),
  ('insecticides','Insecticides','Inputs','Farm Inputs',490),
  ('food','Food','Inputs','Farm Inputs',500),

  ('harvesting','Harvesting','Harvest & sale','Labor',600),
  ('kalakal','Kalakal (haul/trade)','Harvest & sale','Selling Transport',610),
  ('kamada','Kamada','Harvest & sale','Labor',620),
  ('lalamove','Lalamove','Harvest & sale','Selling Transport',630),
  ('trucking','Trucking','Harvest & sale','Selling Transport',640),
  ('toll_gate','Toll Gate','Harvest & sale','Selling Transport',650),

  ('tractor','Tractor','Machines & transport','Machines',700),
  ('barang','Barang (repairs, parts, diesel)','Machines & transport','Machines',710),
  ('araro_repair','Araro Repair','Machines & transport','Machines',720),
  ('diesel','Diesel','Machines & transport','Machines',730),
  ('mechanic','Mechanic','Machines & transport','Machines',740),

  -- The only escape from the vocabulary, and it demands a note.
  ('other','Other (say what, in the note)','Other','Miscellaneous',9000)
on conflict (code) do nothing;

insert into buyers (name) values
  ('Maynilaan'), ('Batas'), ('Batangas'), ('East West Rd')
on conflict (name) do nothing;

-- Pineapple grades, best first, then the crops that sell by product name.
insert into products (code, label, sort_order, is_grade) values
  ('primera','Primera',1,true),
  ('segunda','Segunda',2,true),
  ('tercera','Tercera',3,true),
  ('kwarta','Kwarta',4,true),
  ('quinta','Quinta',5,true),
  ('lakatan','Lakatan',10,false),
  ('tundan','Tundan',11,false),
  ('small_tundan','Small Tundan',12,false),
  ('diaz','Diaz',13,false),
  ('papaya','Papaya',14,false),
  ('peanut','Peanut',15,false),
  ('mane','Mane',16,false),
  ('corn','Corn',17,false),
  ('coffee','Coffee',18,false),
  ('mango','Mango',19,false)
on conflict (code) do nothing;

-- 50kg sacks dosed at 40g per plant: 1,250 plants to a sack. The app suggests a
-- draw quantity from the latest plant count so he stops counting sacks by hand.
insert into input_types (code, label, unit, kg_per_unit) values
  ('fert_21_0_0','Fertilizer 21-0-0','sack',50),
  ('fert_16_20_0','Fertilizer 16-20-0','sack',50),
  ('fert_0_0_60','Fertilizer 0-0-60','sack',50),
  ('fruiting_formula','Fruiting Formula','sack',50),
  ('ethrel','Ethrel','litre',null),
  ('onecide','Onecide','litre',null),
  ('diuron','Diuron','litre',null),
  ('agroxone','Agroxone','litre',null),
  ('herbicide_other','Herbicide (other)','litre',null),
  ('insecticide_other','Insecticide (other)','litre',null)
on conflict (code) do nothing;
