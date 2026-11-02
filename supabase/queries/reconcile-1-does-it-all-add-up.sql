-- 1. The whole book, three ways
--
-- Read-only. Run this on its own: the Supabase SQL editor shows only the
-- last result when several statements run together.
--
-- This is the answer to the question. The first three rows must add up to
-- the fourth. If they do, every peso is accounted for: either recategorised,
-- waiting on a decision, or already on the new names.

select
  'recategorised'                            as bucket,
  count(*)                                   as entries,
  coalesce(sum(amount_centavos), 0) / 100    as pesos
from expenses
where voided_at is null and legacy_activity is not null
union all
select
  'waiting on a decision',
  count(*),
  coalesce(sum(amount_centavos), 0) / 100
from expenses
where voided_at is null and legacy_activity is null
  and (activity = 'other' or activity in (
    'spray','liquid','stab_drop','pinya_trimming',
    'material_collection','fruiting_formula','land_prep'))
union all
select
  'already on the new names',
  count(*),
  coalesce(sum(amount_centavos), 0) / 100
from expenses
where voided_at is null and legacy_activity is null
  and activity <> 'other'
  and activity not in (
    'spray','liquid','stab_drop','pinya_trimming',
    'material_collection','fruiting_formula','land_prep')
union all
select
  '== TOTAL, all live expenses',
  count(*),
  coalesce(sum(amount_centavos), 0) / 100
from expenses
where voided_at is null;
