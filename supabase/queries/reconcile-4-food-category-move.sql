-- 4. The one intended category move: crew food leaving Farm Inputs
--
-- Read-only. Run this on its own: the Supabase SQL editor shows only the
-- last result when several statements run together.
--
-- The only intended move between categories. Everything else kept the kind of
-- money it was. This is why input cost per plant now reads lower, and more
-- truthfully.

-- Everything else kept the kind of money it was. This should be the only
-- figure that shifted between categories, and it is the reason input cost
-- per plant will read lower than it used to.
select count(*) as entries,
       coalesce(sum(amount_centavos), 0) / 100 as pesos_moved_to_labour
from expenses
where voided_at is null and legacy_activity = 'food' and category = 'Labor';
