-- 0036_fertiliser_in_kilos.sql — count fertiliser in kilos, not sacks.
--
-- The protocol doses in grams per plant. The shed counted 50 kg sacks. So a
-- 450 g potash round came out as 0.009 of a sack: arithmetically right and
-- impossible for anybody to check by eye.
--
-- That was tolerable while the app did the arithmetic and showed the answer.
-- It stops being tolerable the moment the farm manager types the number
-- himself, which is what the per-plot input screen is for. "0.134" and "1.34"
-- look alike at arm's length on a phone in sunlight, and that is a
-- ten-times costing error on a sack of urea.
--
-- In kilos the typed number matches what he is holding: a scoop, a bucket, a
-- weighed amount. 450 g is 0.45 kg.
--
-- WHAT MOVES. The six sack-based input types become kilos, and every purchase
-- and draw against them is restated: quantity x 50, unit cost ÷ 50. The money
-- does not change — 5 sacks at ₱1,100 is 250 kg at ₱22, and ₱5,500 either way.
-- The 92 sacks in stock become 4,600 kg.

do $$
declare
  bad text;
  sacks text[] := array['urea', 'dap', 'fert_0_0_60', 'fert_21_0_0',
                        'fert_16_20_0', 'fruiting_formula'];
begin
  -- Already converted? Then there is nothing to do and nothing to check.
  if not exists (
    select 1 from input_types where code = any(sacks) and unit = 'sack'
  ) then
    raise notice 'fertiliser is already counted in kilos';
    return;
  end if;

  /*
   * All or nothing.
   *
   * A price per sack divides into a whole number of centavos per kilo
   * whenever it is a multiple of 50 centavos, which every whole-peso price
   * is. If some lot were priced at, say, ₱1,100.01 the division would not
   * come out, and the only ways through would be to restate that lot's total
   * by a centavo or to leave it in sacks.
   *
   * Leaving one lot in sacks is the dangerous option: the shed would then
   * hold two units under one name and every figure that summed them would be
   * wrong by a factor of fifty. So this refuses the whole migration and names
   * the lots, rather than converting most of them.
   */
  select string_agg(id::text, ', ') into bad
  from input_purchases
  where input_type = any(sacks) and unit_cost_centavos % 50 <> 0;

  if bad is not null then
    raise exception
      'Cannot convert to kilos: these lots have a per-sack price that does '
      'not divide into whole centavos per kilo. Correct them first, then run '
      'this again. Lots: %', bad;
  end if;

  -- Purchases: fifty times the quantity at a fiftieth of the price. The
  -- total is untouched, so no recorded money moves.
  update input_purchases
  set quantity           = quantity * 50,
      unit_cost_centavos = unit_cost_centavos / 50,
      unit               = 'kg'
  where input_type = any(sacks);

  -- Draws: the same quantity expressed in the new unit.
  update input_draws d
  set quantity = d.quantity * 50
  from input_purchases p
  where p.id = d.purchase_id and p.input_type = any(sacks);

  update input_types
  set unit = 'kg', kg_per_unit = 1
  where code = any(sacks);

  raise notice 'fertiliser is now counted in kilos';
end $$;
