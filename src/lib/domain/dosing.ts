/**
 * Plant counts and fertiliser dosing.
 *
 * The farm doses at 40g per plant and buys in 50kg sacks, so one sack covers
 * 1,250 plants. The farm manager was already keeping that arithmetic by hand in
 * the margin of the old book; this is the same sum, done for him and shown with
 * its working so he can see it is right and overrule it when it is not.
 */

export const GRAMS_PER_PLANT = 40;
export const KG_PER_SACK = 50;

export type PlantCountObservation = {
  date: string; // ISO yyyy-mm-dd
  count: number;
  note?: string | null;
};

/**
 * The plant count as it stood on a given date.
 *
 * Counts are periodic and go stale, and they are never overwritten. A dose
 * recorded in February must use February's count, not the recount done in
 * August — otherwise closing a cycle would silently rewrite its own history.
 */
export function plantCountAsOf(
  observations: readonly PlantCountObservation[],
  onDate: string,
): PlantCountObservation | null {
  let best: PlantCountObservation | null = null;
  for (const o of observations) {
    if (o.date <= onDate && (best === null || o.date > best.date)) best = o;
  }
  return best;
}

export type DoseSuggestion = {
  /** Suggested draw, in the purchase's own unit (sacks, litres). */
  quantity: number;
  plantCount: number;
  countDate: string;
  /** Plain-language working, shown under the field. */
  workingNote: string;
};

/**
 * Suggests how much to draw for a whole-cycle application.
 *
 * Returns null when there is no plant count to work from, or when the input is
 * not dosed per plant (herbicides are measured by the sprayer, not the plant),
 * so the field simply stays empty rather than offering a made-up number.
 */
export function suggestDrawQuantity(args: {
  observations: readonly PlantCountObservation[];
  onDate: string;
  kgPerUnit: number | null;
  gramsPerPlant?: number;
}): DoseSuggestion | null {
  const { observations, onDate, kgPerUnit } = args;
  const gramsPerPlant = args.gramsPerPlant ?? GRAMS_PER_PLANT;

  if (kgPerUnit === null || kgPerUnit <= 0) return null;
  const observed = plantCountAsOf(observations, onDate);
  if (observed === null || observed.count <= 0) return null;

  const gramsNeeded = observed.count * gramsPerPlant;
  const gramsPerUnit = kgPerUnit * 1000;
  const quantity = round3(gramsNeeded / gramsPerUnit);

  const plantsPerUnit = Math.floor(gramsPerUnit / gramsPerPlant);
  return {
    quantity,
    plantCount: observed.count,
    countDate: observed.date,
    workingNote:
      `${observed.count.toLocaleString("en-PH")} plants at ${gramsPerPlant}g ` +
      `= ${quantity} sacks (one ${kgPerUnit}kg sack covers ` +
      `${plantsPerUnit.toLocaleString("en-PH")} plants)`,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** What is left in a purchased lot after the draws made against it. */
export function remainingStock(
  purchasedQuantity: number,
  draws: readonly { quantity: number }[],
): number {
  const drawn = draws.reduce((a, d) => a + d.quantity, 0);
  return round3(purchasedQuantity - drawn);
}

/**
 * Cost of a draw: unconsumed stock stays inventory, so only what leaves the
 * lot reaches a cycle's P&L.
 */
export function drawCostCentavos(unitCostCentavos: number, quantity: number): number {
  return Math.round(unitCostCentavos * quantity);
}
