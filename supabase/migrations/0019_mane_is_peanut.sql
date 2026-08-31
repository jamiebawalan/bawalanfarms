-- ---------------------------------------------------------------------------
-- Mane and peanut are the same crop
-- ---------------------------------------------------------------------------
-- The app carried both as separate crops, which meant one rotation crop was
-- being counted as two: a plot under mane and a plot under peanut looked like
-- different things on every report, and the nitrogen-fixing rotation the farm
-- runs on (D003) was split down the middle.
--
-- Peanut survives as the code because the farm's own record of its decisions
-- says peanut throughout, and the suggestions on the plot pages reason from
-- those words. Mane survives where it matters more — on screen, first, because
-- that is what the crew actually says.

update crop_cycles set crop = 'peanut' where crop = 'mane';

update crops
   set label = 'Mane (peanut)'
 where code = 'peanut';

delete from crops where code = 'mane';

do $$
declare stragglers integer;
begin
  select count(*) into stragglers from crop_cycles where crop = 'mane';
  if stragglers > 0 then
    raise exception '% cycles are still on mane', stragglers;
  end if;
end $$;
