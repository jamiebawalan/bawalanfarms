import { splitByArea } from "./split";
import { areaOn } from "./plots";
import type { Centavos } from "./money";
import type { Cycle, ISODate, Ledger } from "./types";

/**
 * The farm-wide overhead pool.
 *
 * Vehicle repairs, tollgates and animal care genuinely cannot be pinned to a
 * plot at the moment they are paid, and forcing a guess at entry time is how
 * the old book ended up with PHP 609,203 sitting in an unattributed heap. So
 * they are pooled at entry and allocated here, at report time, by area across
 * the cycles that were actually live when the money was spent.
 *
 * Allocating per expense date rather than over the whole period matters: a
 * cycle that ran January to March should not absorb a share of December's
 * truck repair.
 */

export type OverheadAllocation = {
  cycleId: string;
  amountCentavos: Centavos;
};

export type OverheadResult = {
  /** Total farm-wide spend in the window, whether or not it could be allocated. */
  poolCentavos: Centavos;
  byCycle: Map<string, Centavos>;
  /**
   * Pool money that landed on no cycle, because nothing was growing anywhere
   * that day. Reported rather than quietly dropped or spread over cycles that
   * did not exist yet.
   */
  unallocatedCentavos: Centavos;
};

/** Was this cycle live on this date? Planned cycles have not started spending. */
export function cycleIsLiveOn(cycle: Cycle, onDate: ISODate): boolean {
  if (cycle.status === "planned") return false;
  const start = cycle.dateStarted ?? cycle.datePlanted ?? cycle.dateClosed;
  if (start === null || start > onDate) return false;
  return cycle.dateClosed === null || cycle.dateClosed >= onDate;
}

export function allocateFarmWide(
  ledger: Ledger,
  opts: { from?: ISODate; to?: ISODate } = {},
): OverheadResult {
  const plotById = new Map(ledger.plots.map((p) => [p.id, p]));
  const byCycle = new Map<string, Centavos>();
  let pool = 0;
  let unallocated = 0;

  const farmWide = ledger.expenses.filter(
    (e) =>
      e.attribution === "farm_wide" &&
      (opts.from === undefined || e.date >= opts.from) &&
      (opts.to === undefined || e.date <= opts.to),
  );

  for (const expense of farmWide) {
    pool += expense.amountCentavos;

    // Cycles live on the day the money was spent, on plots that carry overhead.
    // The Mango plot is excluded by the owner's choice (plots.shares_overhead).
    const live = ledger.cycles.filter((c) => {
      if (!cycleIsLiveOn(c, expense.date)) return false;
      return plotById.get(c.plotId)?.sharesOverhead ?? false;
    });

    if (live.length === 0) {
      unallocated += expense.amountCentavos;
      continue;
    }

    // Two cycles can share a plot's area over time but never on the same day,
    // so one entry per live cycle is right.
    const split = splitByArea(
      expense.amountCentavos,
      live.map((c) => ({
        plotId: c.id, // key the split by cycle: that is what carries the P&L
        label: c.id,
        areaSqm: areaOn(ledger.plotAreas, c.plotId, expense.date),
      })),
    );

    if (split.lines.length === 0) {
      unallocated += expense.amountCentavos;
      continue;
    }

    for (const line of split.lines) {
      byCycle.set(line.plotId, (byCycle.get(line.plotId) ?? 0) + line.amountCentavos);
    }
    // A live cycle on an unsurveyed plot takes no share; its money stays with
    // the cycles that could take one, and splitByArea has already ensured the
    // lines total the expense exactly.
  }

  return { poolCentavos: pool, byCycle, unallocatedCentavos: unallocated };
}

/**
 * Overhead as a share of total spend, which the owners want kept under control.
 * Capital is excluded from both sides: buying a sprayer is not overhead.
 */
export function overheadShare(
  ledger: Ledger,
  opts: { from?: ISODate; to?: ISODate } = {},
): { poolCentavos: Centavos; totalCentavos: Centavos; share: number } {
  let pool = 0;
  let total = 0;
  for (const e of ledger.expenses) {
    if (opts.from !== undefined && e.date < opts.from) continue;
    if (opts.to !== undefined && e.date > opts.to) continue;
    if (e.attribution === "capital") continue;
    total += e.amountCentavos;
    if (e.attribution === "farm_wide") pool += e.amountCentavos;
  }
  return { poolCentavos: pool, totalCentavos: total, share: total === 0 ? 0 : pool / total };
}
