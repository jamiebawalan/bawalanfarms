-- 2. Nothing stranded on a code that no longer exists
--
-- Read-only. Run this on its own: the Supabase SQL editor shows only the
-- last result when several statements run together.
--
-- Should say "none — all good". Anything else means an expense points at a
-- code the migration removed, which would break the cost screens.

select coalesce(string_agg(distinct e.activity, ', '), 'none — all good')
         as activities_that_no_longer_exist
from expenses e
left join activities a on a.code = e.activity
where a.code is null;
