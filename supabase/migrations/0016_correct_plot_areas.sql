-- ---------------------------------------------------------------------------
-- The surveyed areas, corrected
-- ---------------------------------------------------------------------------
-- From "Per Plot Status", column C, of the farm's own workbook. Twenty-one of
-- the twenty-seven plots move, several by a third or more: plot 16 halves, plot
-- 18 grows by three-fifths, plot 6 by a third.
--
-- This corrects the original survey rather than recording a new one. The land
-- did not change size; the numbers the app was given were wrong. A new
-- effective_from row would claim the plots grew on a particular date, which is
-- not what happened, and would leave every past figure resting on a number
-- everyone now agrees is incorrect.
--
-- What this moves, and what it does not:
--
--   * Whole-farm overhead is apportioned by area every time a report is drawn,
--     so every plot's share of it changes from now on, including for months
--     already past. That is the point: those shares were computed on wrong
--     areas.
--   * Costs already split across plots were apportioned when they were entered
--     and their amounts are stored. Those rows do not move on their own. The
--     historical import used the old areas, so those splits still carry the old
--     proportions until somebody decides to redo them.
--
-- Plot 27 (Coffee) still has no area. That remains an open question.

update plot_areas a
   set area_sqm = v.area,
       note = 'Corrected from the farm workbook, Per Plot Status'
  from (values
    ('1',6364),('2',5651),('3',3468),('4',4200),('5',4228),('6',7370),('7',7775),('8',8376),
    ('9',1984),('10',2942),('11',7536),('12',3258),('13',2075),('14',6180),('15',3208),('16',2711),
    ('17',5537),('18',3854),('19',3273),('20',2722),('21',3673),('22',3872),('23',3631),('24',3631),
    ('25',6765),('26',4466),('Mango',3630)
  ) as v(code, area)
  join plots p on p.code = v.code
 where a.plot_id = p.id
   and a.effective_from = date '2015-01-01'
   and a.area_sqm <> v.area;

-- A plot that somehow has no area row at all still gets one, so the correction
-- cannot silently leave a plot out of every split.
insert into plot_areas (plot_id, effective_from, area_sqm, note)
select p.id, date '2015-01-01', v.area, 'Corrected from the farm workbook, Per Plot Status'
from (values
  ('1',6364),('2',5651),('3',3468),('4',4200),('5',4228),('6',7370),('7',7775),('8',8376),
  ('9',1984),('10',2942),('11',7536),('12',3258),('13',2075),('14',6180),('15',3208),('16',2711),
  ('17',5537),('18',3854),('19',3273),('20',2722),('21',3673),('22',3872),('23',3631),('24',3631),
  ('25',6765),('26',4466),('Mango',3630)
) as v(code, area)
join plots p on p.code = v.code
on conflict (plot_id, effective_from) do nothing;

-- Guard against a typo in the list above: plots 1-26 must now total 118,750.
do $$
declare total numeric;
begin
  select sum(a.area_sqm) into total
  from plot_areas a join plots p on p.id = a.plot_id
  where p.code ~ '^[0-9]+$' and p.code::int between 1 and 26
    and a.effective_from = date '2015-01-01';
  if total <> 118750 then
    raise exception 'plot areas 1-26 total % sqm, expected 118750', total;
  end if;
end $$;

select p.code as plot, a.area_sqm as corrected_sqm
  from plot_areas a join plots p on p.id = a.plot_id
 where a.effective_from = date '2015-01-01'
 order by case when p.code ~ '^[0-9]+$' then p.code::int else 99 end, p.code;
