-- ---------------------------------------------------------------------------
-- The traced boundary is now what a plot's area means
-- ---------------------------------------------------------------------------
-- Until now the area came from a figure typed into a workbook, and the boundary
-- was a separate drawing that happened to agree with it — mostly. Where the two
-- disagreed, somebody had to decide which to believe.
--
-- The owners have decided: the map wins. So the number is taken from the shape
-- rather than copied alongside it, and a boundary redrawn in Google Earth and
-- re-imported will carry its own area across without anyone transcribing
-- anything. The two can no longer drift, because there is only one of them.
--
-- Most plots move by a square metre or less, which is rounding. Four move for
-- real: plot 7 by -383, plot 11 by -388, plot 13 by -166, plot 19 by -28 —
-- polygons redrawn in New Farm Mapping 2.0 after the workbook was written.
--
-- Mango keeps its surveyed figure. It has no polygon in the export, and a plot
-- with no boundary must not silently lose its area.

update plot_areas a
   set area_sqm = round(b.total, 1),
       note = 'From the traced boundary, New Farm Mapping 2.0'
  from (
    select plot_id, sum(area_sqm) as total
      from plot_boundaries group by plot_id
  ) b
 where a.plot_id = b.plot_id
   and a.effective_from = date '2015-01-01'
   and a.area_sqm <> round(b.total, 1);

do $$
declare
  total numeric;
  undrawn integer;
begin
  -- Every plot that has a boundary must now agree with it exactly.
  select count(*) into undrawn
    from plot_boundaries b
    join plot_areas a on a.plot_id = b.plot_id and a.effective_from = date '2015-01-01'
   group by b.plot_id, a.area_sqm
  having round(sum(b.area_sqm), 1) <> a.area_sqm;
  if coalesce(undrawn, 0) > 0 then
    raise exception '% plots still disagree with their own boundary', undrawn;
  end if;

  select sum(a.area_sqm) into total
    from plot_areas a join plots p on p.id = a.plot_id
   where p.code ~ '^[0-9]+$' and p.code::int between 1 and 26
     and a.effective_from = date '2015-01-01';
  if round(total) <> 117179 then
    raise exception 'plot areas 1-26 total % sqm, expected 117179', round(total);
  end if;
end $$;

select p.code as plot, a.area_sqm as area_from_the_map
  from plot_areas a join plots p on p.id = a.plot_id
 where a.effective_from = date '2015-01-01'
 order by case when p.code ~ '^[0-9]+$' then p.code::int else 99 end, p.code;
