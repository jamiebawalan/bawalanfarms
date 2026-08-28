/**
 * Which crops are counted plant by plant.
 *
 * Pineapple is: the farm counts the plants, doses at 40g each, and cost per
 * plant is the number the owners actually steer by. Peanut is not counted that
 * way, and neither are the bananas — for those, cost per square metre is the
 * meaningful figure.
 *
 * This only decides whether the app asks. A count can still be recorded for any
 * crop; the app simply does not nag for one it has no reason to expect.
 */
const COUNTED_PER_PLANT = new Set(["pineapple"]);

export function isCountedPerPlant(crop: string): boolean {
  return COUNTED_PER_PLANT.has(crop.toLowerCase());
}
