import type { Ledger } from "./types";

/**
 * What to call a cost line.
 *
 * Costs reach the breakdowns under two different kinds of key. Money logged
 * as an expense carries an activity code; money that came out of the shed
 * carries the input_type code of the stock drawn. Both land in the same
 * "by activity" list on the same screen, so a map built from the activity
 * catalogue alone leaves the drawn stock showing its raw code —
 * "fert_0_0_60" where the sack says muriate of potash.
 *
 * Activities are merged last, so if a code ever existed in both catalogues
 * the activity wins: that is the one the family chose the words for.
 */
export function labelFor(ledger: Ledger): Map<string, string> {
  return new Map<string, string>([
    ...ledger.inputTypes.map((t) => [t.code, t.label] as const),
    ...ledger.activities.map((a) => [a.code, a.label] as const),
  ]);
}
