/**
 * The farm's protocol, and the only agronomy that governs.
 *
 * "Bawalan Farms Pineapple Protocol: Land Prep to Harvest (v1.0)", 1 Nov 2026 —
 * built on Del Monte's FY2024 C74 Plantation Practice 2 schedules and adapted
 * across seven consultations (Livie ×6, Joseph Fernandez ×1), for Smooth
 * Cayenne at ~300 masl in Silang, Cavite.
 *
 * Everything the farm believed about agronomy before this document is
 * superseded by it. That is the owners' instruction, not an inference: the
 * D-leaf measurements taken before November 2026 were taken by a method the
 * consultants have since corrected, and the readings themselves have been set
 * aside in the database (migration 0025).
 *
 * This is held as text rather than tables because it is what Claude reads
 * before advising. The machine-readable schedule — the thing that computes a
 * fertiliser mix for a named block — is a separate build and will live in the
 * database, so a revision is rows rather than a deploy.
 */

export const PROTOCOL_VERSION = "v1.0";
export const PROTOCOL_DATED = "2026-11-01";

export const PROTOCOL_RULE = `Every activity is pinned to MAP — months after planting. MAP 0 is planting day; MAP -4 is four months before planting. A plant crop runs about 19 to 20 months: roughly 12 months of growth, forcing at MAP 12 to 13, then 5 to 6 months of fruit development. Land prep starts 4 to 6 months before planting.

The rule that makes Del Monte's numbers usable here: dose per plant, not per hectare. Del Monte writes its schedule in kg/ha at 78,000 plants/ha; this farm runs about 26,500 plants/ha and is aiming for 40,000 to 50,000. So every fertiliser and foliar dose is converted to grams per plant, and the amount for a plot is g/plant x live plants in that plot / 1,000 = kg to mix.

Three things are per area and must never be scaled by plant count: lime, dolomite and rock phosphate (soil decisions); herbicides (sprayed on the ground); and drainage and land prep.

MAP is not calendar age. Plots already planted when the protocol was adopted sit on the schedule by growth stage, so a plot's protocol month can run well behind its planting date — Plot 24 is at MAP 8 though it was planted in December 2025. Expect those plots to force and harvest later than the calendar suggests. Plots planted from November 2026 count MAP from the planting date.`;

export const PROTOCOL_CALENDAR = `MAP -6 to -5  Soil test every plot; chop the old crop (2 passes, 7 days apart); knock down weeds with glyphosate.
MAP -4  Lime, dolomite or rock phosphate per the soil-test matrix, before plowing so it mixes in; deep rip or plow to 18 in on dry-enough soil (never wet: it makes a pan roots cannot cross).
MAP -3  Wait ~21 days after plowing; harrow to a crumb; dig drainage canals.
MAP -1 to 0  Form raised beds; pre-plant soil insecticide; prepare and treat planting material.
MAP 0  Pre-emergent herbicide on the beds, then plant within hours.
MAP 0.5  Mortality check 2 to 3 weeks after planting; replant the gaps.
MAP 1 to 2  Mealybug, ant and white-grub watch begins.
MAP 2  First dry side-dress: DAP or ammonium sulfate — never both, the soil test decides — plus potash.
MAP 3  Spot-spray weeds; first preventive phosphonate round.
MAP 4  Second DAP only if soil P is low; the foliar programme starts (urea + iron + zinc).
MAP 5  Dry side-dress: potash and Epsom salt; foliar continues.
MAP 6  Foliar adds potash and Epsom; phosphonate round 2.
MAP 7  First D-leaf tissue test and plant weight/height survey.
MAP 8  Foliar; extra urea or potash only if the MAP 7 tissue test says low.
MAP 9  Second tissue test and survey; the only boron round; phosphonate round 3.
MAP 10  Foliar; spot-spray.
MAP 11  Third tissue test and survey; last full foliar; start easing nitrogen.
MAP 12  Reduced-nitrogen foliar; forcing-readiness check.
MAP 12 to 13  Forcing: ethephon plus urea at 6 PM, two rounds a day apart.
MAP 13 to 14  Differentiation test 21 to 25 days after forcing; re-force failures.
MAP 15 to 16  Open-flower stage: pink-disease spray; optional fruit-sizing spray.
MAP 16 to 17  Suckers emerge; keep the plants healthy.
MAP 18 to 19  Optional ripening spray; harvest by maturity and grade.
Harvest +0 to 6 weeks  Remove slips within 2 weeks; harvest suckers ~1 month later; treat and plant within ~3 days.
After the last harvest  Chop, soil test, ~4-month fallow, restart at MAP -6.`;

export const PROTOCOL_NUTRITION = `Principle: feed small, frequent, per-plant doses. Dry side-dress at MAP 2 to 5 to build roots, then a monthly foliar from MAP 4 to 12, tapering nitrogen before forcing. The programme delivers about 10 to 11 g of nitrogen per plant over the crop, against about 25 g from the farm's old three doses of 40 g of 21-0-0 — and at roughly half the material cost on the priced items.

Dry side-dress, grams per plant:
- MAP 2: DAP (18-46-0) 4.7 when soil pH > 5.0 and soil P <= 20 ppm; or ammonium sulfate (21-0-0) 4.7 instead when soil P > 20 ppm or rock phosphate went on at MAP -4. Never both.
- MAP 2: MOP (0-0-60) 1.0 when soil K >= 100 ppm (the default), or 1.7 when soil K < 100 ppm.
- MAP 4: DAP 3.8, only if soil pH > 5.0 and soil P < 12 ppm.
- MAP 5: MOP 2.3 on all plots, and Epsom salt 8.0 on all plots.

Foliar, grams per plant per round — urea / iron sulfate / zinc sulfate / Solubor / MOP at half dose / Epsom:
- MAP 4: 0.99 / 0.10 / 0.008 / - / - / -
- MAP 5: 1.39 / 0.10 / 0.008 / - / - / -
- MAP 6: 1.58 / 0.10 / 0.012 / - / 0.17 / 0.45
- MAP 7: 2.24 / 0.20 / 0.012 / - / 0.17 / 0.45
- MAP 8: 2.43 / 0.20 / 0.012 / - / 0.17 / 0.51
- MAP 9: 2.52 / 0.20 / 0.012 / 0.048 / 0.17 / 0.51
- MAP 10: 2.52 / 0.20 / 0.012 / - / 0.17 / 0.51
- MAP 11: 2.58 / 0.20 / 0.012 / - / 0.17 / 0.51
- MAP 12: 1.78 / 0.15 / 0.008 / - / 0.17 / 0.51
- MAP 13 is the forcing month: no foliar.
- MAP 14: urea 1.78 only after flowering is confirmed and only if the plants are yellow.

Mixing: half-fill with clean water, then dissolve in this order — MOP, zinc sulfate, Epsom, iron sulfate, Solubor, urea last. Water by plot area at 2,000 L/ha; spray by plant. Rinse a herbicide sprayer three times, or better, keep separate sprayers. Spray early morning before about 26 C, or late afternoon; not if rain is expected within 2 hours.

Standing rules from the consultations:
- Dry first, foliar later: plants at MAP 2 to 4 have too little leaf to catch a spray.
- Phosphorus only through the soil, never foliar.
- Never a big nitrogen dose at once; much of a 40 g dose of 21-0-0 is lost to evaporation and leaching.
- In a dry spell still apply P, K and Mg — they stay in the soil — but hold the nitrogen side-dress until the soil is moist, and apply it after rain rather than before heavy rain.
- Keep the plants green; pineapple is very sensitive to nitrogen and yellowing means act now.
- Foliar nitrogen is urea (46-0-0), not ammonium sulfate, to reduce leaf burn. The 21-0-0 stock goes to soil side-dress and high-pH patches only.
- Potassium is MOP (0-0-60) in place of Del Monte's potassium sulfate, at about 0.35x the KS weight; foliar MOP is half that again.
- Magnesium is Epsom salt for both side-dress and foliar, because kieserite is hard to source.`;

export const PROTOCOL_FORCING = `Plant weight, not height, is the go signal. Force only when the plot's plants are heavy enough, after a month of easing nitrogen, at 6 to 7 PM on a cool dry evening, in two rounds one day apart, then confirm with a differentiation test 21 to 25 days later.

Readiness, measured by uprooting and weighing whole plants with roots, about 10 per plot sampled across the height classes:
- Average plant weight at least 2.7 kg. Good fields reach 3.0 kg; Del Monte accepts 2.5 kg on poor fields.
- At least 85% of plants at or above 2.7 kg.
- The lightest plant at least 2.2 kg.
- Nothing above 3.3 kg: over-robust plants are hard to force.
- D-leaf height is reference only — about 1.2 m at 2.7 kg on Del Monte's 78,000/ha spacing.

Leave 40 to 44 days between the last fertiliser round and forcing; a mildly nitrogen-stressed plant forces more reliably. Spray at 6 to 7 PM because pineapple is a CAM plant and opens its pores at night. Best at about 20 to 24 C, cooler is better, and no rain within 2 hours after. The cool months of December to February are safest at this altitude.`;

export const PROTOCOL_MONITORING = `Four measurements steer every decision, and all of them go in the app.
- Soil tests: every plot before planting, every plot after harvest, and any plot with unexplained red or yellow plants. Ten samples per plot from the middle areas, 6 to 12 in deep, mixed into one ~1 kg composite. Request pH, P, K, Mg, Ca.
- D-leaf tissue tests at MAP 7, 9 and 11 and before forcing. Ten plants per plot, a mix of big, medium and small. The D-leaf is the longest leaf when all leaves are gathered upward — mid-plant and most active, not the youngest. Split into white base and green middle, bag separately, deliver within 24 hours.
- Plant weight and height survey at MAP 7, 9, 11 and right before forcing: measure heights across the plot, uproot at least one plant per 15 cm height class, weigh whole with roots.
- A standard photo set monthly per plot and before any decision: 15 to 20 photos — wide shots from several corners, mid-range rows, and close-ups of typical and problem plants.`;

export const PROTOCOL_OPEN = `The protocol is v1.0 and names its own unfinished edges. Do not present any of these as settled:
- Seed-treatment dip: water volume and dip time.
- Herbicide spray volume per hectare (1,000 vs 4,000 L/ha).
- Bed height after forming.
- Nursery fertilisation for planting material.
- The pest programme walk-through, and whether the pink-disease, fruit-sizing and ripening sprays are worth it for a local market.
- The forcing recipe: Livie quoted 2.5 L ethephon + 20 kg urea/ha; the Del Monte sheet shows Nydrel 2.33 L + 40 kg urea per round.
- Mapping local primera/segunda grades to eye count and weight.
- Prices for Epsom salt, iron sulfate, zinc sulfate, Solubor and current DAP.
- Lime timing: Livie liming before chopping, against Del Monte's MAP -4.`;
