-- 3. What moved where, and for how much
--
-- Read-only. Run this on its own: the Supabase SQL editor shows only the
-- last result when several statements run together.
--
-- Eyeball this one. "was" is the code originally chosen and "now_is" is where
-- it landed. Nothing should look surprising; anything that does can be moved
-- back, because "was" is kept on every row.

-- Eyeball this. "was" is the code originally chosen; "now_is" is where it
-- landed. Anything surprising can be moved back, because "was" is kept.
select
  coalesce(e.legacy_activity, '(not moved)') as was,
  e.activity                                 as now_is,
  e.category                                 as kind_of_money,
  count(*)                                   as entries,
  sum(e.amount_centavos) / 100               as pesos
from expenses e
where e.voided_at is null
group by 1, 2, 3
order by pesos desc;
