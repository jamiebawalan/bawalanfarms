/**
 * The parts of the memory export that are prose rather than records.
 *
 * These are lifted from MEMORY.md, PROJECT.md and USER_PROFILE.md as exported
 * from eighteen months of the owners' agronomy conversations. Keep them close
 * to the original wording: they are the farm's own account of how it operates,
 * and paraphrasing them here would quietly change what the app believes.
 *
 * To refresh from a newer export, replace the strings below and the four JSON
 * files beside this one. Nothing else needs to change.
 */

export const EXPORTED_ON = "2026-08-30";

/** Where the farm is and how it is run. From MEMORY.md and USER_PROFILE.md. */
export const FARM = `The farm is in Barangay Batas, Silang, Cavite, Philippines. Soil is clay loam and drainage is a real constraint. Production is predominantly rainfed; irrigation has been considered but not built. The farm has grown from roughly 10 ha toward 12, with planning toward 15.

The primary crop is Smooth Cayenne pineapple. Actual density today is about 26,500 plants per hectare; the protocol targets 40,000 to 50,000. Peanut is the principal rotation crop, used to fix nitrogen, return residue and break the pineapple cycle. Ube, calamansi, watermelon and papaya have been evaluated as alternatives at various points.

Local terms, which the owners and the crew use in preference to English:
- suwe = suckers
- salo = slips
- mane = peanut. One crop, two words; the crew says mane.
- D-leaf = the longest leaf when all the leaves are gathered upward in the hand: mid-plant and the most active, not the youngest. This is the protocol's definition and it replaces the one the farm used before November 2026 — the older description, the longest fully expanded firm leaf at roughly 45 degrees, is part of why the readings taken up to then have been set aside.
- Fruit is graded in the Cavite system: primera, segunda, tercera, kwarta, quinta.`;

/** What the farm has learned about growing the crop. From MEMORY.md. */
/**
 * What the farm used to believe, kept only as history.
 *
 * Every line here predates the protocol and several are now known to be
 * wrong — the D-leaf thresholds most of all, because the measurements behind
 * them were taken by a method the consultants have since corrected. None of
 * it may be offered as advice. It is here so that a reading of the farm's
 * past makes sense, and so that nobody rediscovers an abandoned idea and
 * mistakes it for a new one.
 */
export const HISTORICAL_PRACTICE = `Superseded by the protocol on 1 November 2026. Historical context only — never a recommendation.

D-leaf and forcing:
- D-leaf length is the key maturity and forcing indicator.
- Working targets range from about 75-85 cm for cautious forcing readiness to 95-100 cm for larger plants and larger fruit. Both are legitimate and the owners choose per plot (D011). The default lean is toward the larger threshold, because a harvest tending to primera pays better (D010) — but seasonal pricing can reverse that. Christmas prices rise enough that forcing earlier for smaller fruit can be the better trade on a plot that would otherwise land in a flat market.
- Smooth Cayenne needs a higher D-leaf at forcing than Queen.
- In April 2026 plants at about 60 cm and 73 cm were judged nearly but not fully ready.
- A plot planted September 2025 averaged around 75 cm D-leaf by June 2026.
- Ethrel (ethephon) is used to force in some blocks; not every harvest has been forced.

Nutrition:
- Starter: 16-20-0 or DAP (18-46-0), side-dressed rather than placed against the plant base.
- Vegetative nitrogen: 21-0-0 in split applications, timed to soil moisture.
- Potassium: 0-0-60 is an active management theme. A June 2026 harvest was visibly larger than older harvests and the owners suspect the potassium is why. Increasing to 15 g/plant has been considered.
- Neighbouring farmers apply a further 21-0-0 dose after ethrel; whether this is worth doing is unsettled.
- Well-composted chicken manure has been discussed as optional, with drainage and pH the priorities.

Planting material:
- Sort slips and suckers by type and size before planting. Mixed propagule sizes in one block cost uniformity, even fertiliser response, and synchronised forcing and harvest.
- Planting-material self-sufficiency matters for the expansion, so slips and suckers per harvested mother plant is a number worth counting.
- Forcing affects the slip-versus-sucker balance.

Weeds and residue:
- Pineapple: herbicide options have been compared and pre-emergence suppression is of interest.
- Peanut rotation: mixed monocot and dicot weed pressure is a live problem.
- Peanut should be harvested in a way that leaves roots and nodules in the soil where practical, and vegetative residue returned rather than burned.
- Post-harvest pineapple biomass is a soil resource; decomposition time and low-cost shredding are open questions.`;

/** How the owners want to be advised. From USER_PROFILE.md. */
export const HOW_THEY_WORK = `The owners want concise, quantitative, operational recommendations. What they ask for, again and again: per-plant and per-hectare figures, application timing, trial designs, expected yield or fruit-size impact, simple field measurement protocols, and honest comparisons between what the neighbouring farmers do and what the agronomy says.

Their stated priorities, in order:
1. Increase average fruit weight and saleable grade.
2. Keep induction and harvest timing predictable.
3. Improve planting-material quality and supply.
4. Reduce weed pressure economically.
5. Use rotations such as peanut to improve soil and break crop cycles.
6. Improve water security.
7. Build a feedback loop from D-leaf, harvest weights, propagule counts and plot-level treatments.

Their decision principle, in their own words: treat recommendations as field hypotheses to validate in controlled blocks. Prefer one-variable-at-a-time trials, with enough plants to average out plant-to-plant variation.

When advising, weigh: rate per plant and per hectare, timing against rainfall and soil moisture, compatibility with Smooth Cayenne, phytotoxicity risk, whether the crew can practically do it, the expected effect on yield or fruit size, and how the result will be measured.`;

/**
 * The caveat the owners wrote themselves, and the reason this file is not a
 * prescription list. Eighteen months of conversation contains a great deal of
 * thinking-out-loud, and a rate discussed once is not a rate decided.
 */
export const INTERPRETATION = `The protocol governs. Where anything in the farm's history disagrees with it, the protocol is right and the history is a record of what was done before, not a practice to continue or revive.

Advice must come from the protocol first. Where the protocol is silent, say so plainly rather than filling the gap from the old record — and where the protocol names something as an open item, treat it as open rather than picking a side.

Two things remain true regardless. Doses are per plant, except lime, dolomite, rock phosphate, herbicides and land prep, which are per area. And current label directions and Philippine registrations override any rate in any document here, including the protocol.`;
