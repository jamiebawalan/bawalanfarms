-- Reconciliation — does the old book still add up to the new one?
--
-- Run this in the Supabase SQL editor after the catalogue migration.
-- NOTHING HERE CHANGES ANYTHING. Four read-only queries; run them together
-- and you get four result sets, or run them one at a time.
--
-- Query 1 is the answer to the question: the first three rows must add up to
-- the fourth. If they do, every peso in the book is either recategorised,
-- waiting on a decision, or was already on the new names — and none went
-- missing.

-- =========================================================================
-- 1. The whole book, three ways
-- =========================================================================
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

-- =========================================================================
-- 2. Nothing stranded on a code that no longer exists
-- =========================================================================
select coalesce(string_agg(distinct e.activity, ', '), 'none — all good')
         as activities_that_no_longer_exist
from expenses e
left join activities a on a.code = e.activity
where a.code is null;

-- =========================================================================
-- 3. What moved where, and for how much
-- =========================================================================
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

-- =========================================================================
-- 4. The one intended category move: crew food leaving Farm Inputs
-- =========================================================================
-- Everything else kept the kind of money it was. This should be the only
-- figure that shifted between categories, and it is the reason input cost
-- per plant will read lower than it used to.
select count(*) as entries,
       coalesce(sum(amount_centavos), 0) / 100 as pesos_moved_to_labour
from expenses
where voided_at is null and legacy_activity = 'food' and category = 'Labor';
