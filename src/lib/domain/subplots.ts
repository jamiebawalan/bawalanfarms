/**
 * Blocks within a plot, and what each one cost.
 *
 * A planting that should take a week takes two months, so one plot is a March
 * block and a May block standing side by side. Every figure the app computes
 * for that plot has been averaging them together, which is exactly the
 * comparison the farm needs and cannot make.
 *
 * Two rules govern the money:
 *
 *  1. A cost tagged to a block belongs to that block, whole.
 *  2. A cost tagged to the plot is divided across the blocks when it is read,
 *     never when it is saved. He blocks out the land in month two, by which
 *     time month one's costs are already in the books, and he revises his
 *     percentages when he next walks the field. Dividing at save time would
 *     leave the early costs undivided for ever and freeze his first guess
 *     into every figure after it.
 */

import type { Centavos } from "./money";
import type { ExpenseCategory, ISODate } from "./types";

export type SubPlot = {
  id: string;
  cycleId: string;
  name: string;
  plantedOn: ISODate;
  /** His estimate of how much of the plot this block is, 0–100. */
  landPct: number;
  /** Counted, not estimated. Null until he has counted. */
  plantCount: number | null;
  targetForcingDate: ISODate | null;
  forcedOn: ISODate | null;
  note?: string | null;
};

/**
 * Which number divides a shared cost.
 *
 * Land for the work done on the ground — weeding a block twice the size takes
 * twice the morning. Plants for anything bought and applied to them: a block
 * that is 30% of the land but holds 45% of the plants drinks 45% of the abono,
 * and charging it 30% would make it look cheaper than it is for the whole
 * cycle.
 */
export type SplitBasis = "land" | "plants";

export function basisFor(category: ExpenseCategory): SplitBasis {
  return category === "Farm Inputs" ? "plants" : "land";
}

/**
 * Each block's share of the whole plot, as a fraction of 1.
 *
 * These do not have to add to 1. While he is still planting, the blocks cover
 * part of the plot and the rest is unblocked land that costs are still being
 * spent on. Normalising that away would charge the blocks for ground they do
 * not occupy and hide the fact that the plot is not fully recorded yet.
 *
 * Falls back to land whenever plants cannot answer — a block not yet counted,
 * or a cycle where none have been. A zero everywhere would silently move every
 * shared cost into "unassigned", which reads as "we spent nothing on it".
 */
export function sharesOf(
  subPlots: readonly SubPlot[],
  basis: SplitBasis,
): Map<string, number> {
  const shares = new Map<string, number>();
  if (subPlots.length === 0) return shares;

  const counted = subPlots.every((s) => s.plantCount !== null && s.plantCount > 0);
  if (basis === "plants" && counted) {
    const land = subPlots.reduce((a, s) => a + s.landPct, 0) / 100;
    const plants = subPlots.reduce((a, s) => a + (s.plantCount ?? 0), 0);
    // Scaled to the land they occupy between them, so an unblocked remainder
    // stays unblocked rather than being absorbed by whoever holds most plants.
    for (const s of subPlots) {
      shares.set(s.id, plants > 0 ? ((s.plantCount ?? 0) / plants) * land : 0);
    }
    return shares;
  }

  for (const s of subPlots) shares.set(s.id, s.landPct / 100);
  return shares;
}

export type Apportioned = {
  /** Centavos per block, in the order the blocks were given. */
  bySubPlot: Map<string, Centavos>;
  /** What belongs to the plot but to no block: land not yet blocked out. */
  unassignedCentavos: Centavos;
};

/**
 * Divide one amount across the blocks, to the centavo.
 *
 * Largest remainder, as everywhere else in this app: floor every share, then
 * hand the leftover centavos to whoever was rounded down hardest. The parts
 * plus the unassigned remainder always equal the amount exactly, because a
 * total that does not add up is the thing this app exists to prevent.
 */
export function apportion(
  amountCentavos: Centavos,
  shares: ReadonlyMap<string, number>,
): Apportioned {
  const bySubPlot = new Map<string, Centavos>();
  if (shares.size === 0 || amountCentavos === 0) {
    return { bySubPlot, unassignedCentavos: amountCentavos };
  }

  const rows = [...shares.entries()].map(([id, share]) => {
    const exact = amountCentavos * Math.max(0, share);
    const floored = Math.floor(exact);
    return { id, floored, remainder: exact - floored };
  });

  const assignedExactly = [...shares.values()].reduce((a, v) => a + Math.max(0, v), 0);
  // What the blocks are entitled to between them, floored to the centavo.
  const pot = Math.min(amountCentavos, Math.floor(amountCentavos * Math.min(1, assignedExactly)));
  let leftover = pot - rows.reduce((a, r) => a + r.floored, 0);

  const order = [...rows].sort(
    (a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id),
  );
  const bonus = new Map<string, number>();
  for (let i = 0; leftover > 0 && i < order.length; i++, leftover--) {
    const row = order[i]!;
    bonus.set(row.id, (bonus.get(row.id) ?? 0) + 1);
  }

  let assigned = 0;
  for (const row of rows) {
    const value = row.floored + (bonus.get(row.id) ?? 0);
    bySubPlot.set(row.id, value);
    assigned += value;
  }

  return { bySubPlot, unassignedCentavos: amountCentavos - assigned };
}

/** How much of the plot he has blocked out so far, 0–1. */
export function blockedFraction(subPlots: readonly SubPlot[]): number {
  return subPlots.reduce((a, s) => a + s.landPct, 0) / 100;
}

/** What one block has cost, and where the money came from. */
export type SubPlotCost = {
  subPlot: SubPlot;
  /** Costs tagged to this block alone. */
  directCentavos: Centavos;
  /** This block's share of costs tagged to the whole plot. */
  sharedCentavos: Centavos;
  totalCentavos: Centavos;
  costPerPlantCentavos: Centavos | null;
};

export type SubPlotLedger = {
  blocks: SubPlotCost[];
  /** Spent on the plot but on no block: land not yet blocked out. */
  unassignedCentavos: Centavos;
  totalCentavos: Centavos;
};

/**
 * Every cost on a cycle, laid out block by block.
 *
 * Shared costs are divided here, at the moment of reading, by whichever basis
 * suits the category — so correcting a percentage or counting a block for the
 * first time corrects the history with it, rather than leaving the early
 * months divided by a guess nobody can revisit.
 */
export function subPlotLedger(
  subPlots: readonly SubPlot[],
  costs: readonly {
    subPlotId: string | null;
    category: ExpenseCategory;
    amountCentavos: Centavos;
  }[],
): SubPlotLedger {
  const direct = new Map<string, Centavos>();
  const shared = new Map<string, Centavos>();
  for (const s of subPlots) {
    direct.set(s.id, 0);
    shared.set(s.id, 0);
  }

  // Worked out once per basis rather than once per cost: the shares do not
  // change between rows, and there are hundreds of rows.
  const sharesByBasis = new Map<SplitBasis, Map<string, number>>([
    ["land", sharesOf(subPlots, "land")],
    ["plants", sharesOf(subPlots, "plants")],
  ]);

  let unassigned = 0;
  let total = 0;

  for (const cost of costs) {
    total += cost.amountCentavos;

    if (cost.subPlotId !== null && direct.has(cost.subPlotId)) {
      direct.set(cost.subPlotId, (direct.get(cost.subPlotId) ?? 0) + cost.amountCentavos);
      continue;
    }

    const shares = sharesByBasis.get(basisFor(cost.category))!;
    const split = apportion(cost.amountCentavos, shares);
    for (const [id, amount] of split.bySubPlot) {
      shared.set(id, (shared.get(id) ?? 0) + amount);
    }
    unassigned += split.unassignedCentavos;
  }

  const blocks = subPlots.map((subPlot) => {
    const directCentavos = direct.get(subPlot.id) ?? 0;
    const sharedCentavos = shared.get(subPlot.id) ?? 0;
    const totalCentavos = directCentavos + sharedCentavos;
    return {
      subPlot,
      directCentavos,
      sharedCentavos,
      totalCentavos,
      costPerPlantCentavos:
        subPlot.plantCount !== null && subPlot.plantCount > 0
          ? Math.round(totalCentavos / subPlot.plantCount)
          : null,
    };
  });

  return { blocks, unassignedCentavos: unassigned, totalCentavos: total };
}
