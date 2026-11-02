/**
 * Turning "we did the month-9 foliar" into "take this much out of stock".
 *
 * Proposed, never applied. The farm manager confirms or corrects every line
 * before anything moves, because the stock figures are only as good as the
 * last count and a silent deduction would quietly turn a counting error into
 * a costing error on a plot's P&L. The app is better at the arithmetic and
 * he is better at knowing what actually came out of the shed.
 *
 * The arithmetic is worth doing for him, though. A month-9 round on a block
 * wants 6.68 kg of urea, the shed holds urea in 50 kg sacks, and two lots
 * were bought at different prices. Working out that this is 0.134 of a sack
 * off the older lot is not a sum anybody should do standing in a doorway.
 */

import type { ISODate } from "./types";

/** Stock is counted to the thousandth of a unit, as input_draws stores it. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export type StockLot = {
  purchaseId: string;
  inputType: string;
  date: ISODate;
  /** What is left in this lot, in the input type's own unit. */
  remaining: number;
  unitCostCentavos: number;
};

export type InputType = {
  code: string;
  label: string;
  /** sack, kg, litre. */
  unit: string;
  /** Kilos in one unit, where the pack size is known. */
  kgPerUnit: number | null;
};

/** What a completed activity consumed, in grams or millilitres. */
export type Consumed = {
  materialCode: string;
  materialName: string;
  /** Null where the farm does not carry this as stock. */
  inputType: string | null;
  /** Grams for a solid, millilitres for a liquid. */
  amount: number;
  isLiquid: boolean;
};

export type ProposedDraw = {
  purchaseId: string;
  /** In the input type's own unit, rounded to the thousandth. */
  quantity: number;
  unit: string;
  lotDate: ISODate;
  costCentavos: number;
};

export type DrawLine = {
  materialCode: string;
  materialName: string;
  /** What the protocol asked for, as the field reads it: "6.68 kg". */
  wanted: string;
  /** The same, in the unit the shed counts in. Null when untracked. */
  wantedInUnits: number | null;
  unit: string | null;
  draws: ProposedDraw[];
  /**
   * How much could not be found in stock, in the input type's unit.
   *
   * Said out loud rather than silently drawing less. Running short is
   * information: either the shed is emptier than anybody thought, or a
   * purchase was never entered, and both are worth knowing before the next
   * trip to town.
   */
  shortfall: number;
  /** Why there is nothing to draw, when there is nothing to draw. */
  untracked: boolean;
};

export type DrawProposal = {
  lines: DrawLine[];
  totalCostCentavos: number;
  /** True when anything at all came up short. */
  anyShortfall: boolean;
};

/**
 * How many of an input type's units a dose amounts to.
 *
 * Grams against a 50 kg sack; millilitres against a litre. Returns null when
 * the two cannot be compared — a solid measured against a liquid's unit, or
 * a sack whose weight nobody has recorded — because a wrong conversion here
 * is a draw out by a factor of fifty.
 */
export function toUnits(
  amount: number,
  isLiquid: boolean,
  type: InputType,
): number | null {
  const unit = type.unit.toLowerCase();
  if (isLiquid) {
    if (unit !== "litre" && unit !== "l" && unit !== "liter") return null;
    return round3(amount / 1000);
  }
  if (unit === "kg") return round3(amount / 1000);
  if (type.kgPerUnit === null || type.kgPerUnit <= 0) return null;
  return round3(amount / 1000 / type.kgPerUnit);
}

/**
 * The draw to propose, oldest stock first.
 *
 * Oldest first because fertiliser cakes and chemicals expire, and because a
 * lot left half-drawn for a year is a lot nobody can price honestly. Where a
 * line spans two lots it is split across them at each lot's own cost, which
 * is the only way the plot's P&L stays true to what was actually bought.
 */
export function proposeDraws(
  consumed: readonly Consumed[],
  stock: readonly StockLot[],
  types: ReadonlyMap<string, InputType>,
  format: (amount: number, unit: "g" | "ml") => string,
): DrawProposal {
  // Oldest first, and never draw from a lot twice in one proposal.
  const byType = new Map<string, StockLot[]>();
  for (const lot of stock) {
    if (lot.remaining <= 0) continue;
    const lots = byType.get(lot.inputType);
    if (lots === undefined) byType.set(lot.inputType, [lot]);
    else lots.push(lot);
  }
  for (const lots of byType.values()) {
    lots.sort((a, b) => a.date.localeCompare(b.date));
  }

  const lines: DrawLine[] = [];
  let totalCostCentavos = 0;

  for (const need of consumed) {
    const wanted = format(need.amount, need.isLiquid ? "ml" : "g");
    const type = need.inputType === null ? undefined : types.get(need.inputType);

    if (type === undefined) {
      lines.push({
        materialCode: need.materialCode,
        materialName: need.materialName,
        wanted,
        wantedInUnits: null,
        unit: null,
        draws: [],
        shortfall: 0,
        untracked: true,
      });
      continue;
    }

    const wantedInUnits = toUnits(need.amount, need.isLiquid, type);
    if (wantedInUnits === null) {
      lines.push({
        materialCode: need.materialCode,
        materialName: need.materialName,
        wanted,
        wantedInUnits: null,
        unit: type.unit,
        draws: [],
        shortfall: 0,
        untracked: true,
      });
      continue;
    }

    let left = wantedInUnits;
    const draws: ProposedDraw[] = [];
    for (const lot of byType.get(type.code) ?? []) {
      if (left <= 0) break;
      const take = round3(Math.min(lot.remaining, left));
      if (take <= 0) continue;
      const cost = Math.round(lot.unitCostCentavos * take);
      draws.push({
        purchaseId: lot.purchaseId,
        quantity: take,
        unit: type.unit,
        lotDate: lot.date,
        costCentavos: cost,
      });
      totalCostCentavos += cost;
      lot.remaining = round3(lot.remaining - take);
      left = round3(left - take);
    }

    lines.push({
      materialCode: need.materialCode,
      materialName: need.materialName,
      wanted,
      wantedInUnits,
      unit: type.unit,
      draws,
      shortfall: Math.max(0, round3(left)),
      untracked: false,
    });
  }

  return {
    lines,
    totalCostCentavos,
    anyShortfall: lines.some((l) => l.shortfall > 0),
  };
}
