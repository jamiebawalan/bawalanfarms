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
 * they are pooled at entry and shared out here, at report time, by area.
 *
 * The pool is spread across EVERY plot that carries overhead, planted or not.
 *
 * That is a deliberate choice by the owner, and it is the one that creates the
 * right pressure: an idle plot still costs the farm its share of the truck and
 * the tollgates, so it shows up carrying cost and earning nothing. Excluding
 * idle plots would flatter them and quietly load their share onto the plots
 * that are actually working. The goal is to keep plots planted, and the
 * numbers should say so.
 *
 * Each plot's share then goes to whichever cycle was live there on the day the
 * money was spent. Where nothing was growing, the share is held against the
 * plot instead — visible, not discarded.
 */

export type OverheadResult = {
  /** Total farm-wide spend in the window, whether or not it reached a cycle. */
  poolCentavos: Centavos;
  /** Share that reached a running cycle. */
  byCycle: Map<string, Centavos>;
  /** Share carried by plots that were idle when the money was spent. */
  byIdlePlot: Map<string, Centavos>;
  /** Pool money no plot could take, because no plot had a surveyed area. */
  unallocatedCentavos: Centavos;
};

/** Was this cycle live on this date? Planned cycles have not started spending. */
export function cycleIsLiveOn(cycle: Cycle, onDate: ISODate): boolean {
  if (cycle.status === "planned") return false;
  const start = cycle.dateStarted ?? cycle.datePlanted ?? cycle.dateClosed;
  if (start === null || start > onDate) return false;
  return cycle.dateClosed === null || cycle.dateClosed >= onDate;
}

/**
 * Whether this cycle is holding the plot right now.
 *
 * A different question from cycleIsLiveOn, and the difference is the whole of
 * a bug this got wrong. "Was the cycle live on 10 May" is history: money spent
 * that day belongs to whatever was growing that day, and a cycle closed on the
 * 15th was certainly running on the 10th. "Is the plot occupied today" is the
 * present, and a cycle the manager closed this morning is not occupying
 * anything — he closed it because the plot is empty and he wants to see it in
 * the idle list, today, not tomorrow.
 *
 * cycleIsLiveOn answers the first and must keep answering it, because every
 * historical allocation on this farm rests on it. This answers the second.
 */
export function plotIsOccupiedOn(cycle: Cycle, onDate: ISODate): boolean {
  return cycle.status !== "closed" && cycleIsLiveOn(cycle, onDate);
}

export function allocateFarmWide(
  ledger: Ledger,
  opts: { from?: ISODate; to?: ISODate } = {},
): OverheadResult {
  const byCycle = new Map<string, Centavos>();
  const byIdlePlot = new Map<string, Centavos>();
  let pool = 0;
  let unallocated = 0;

  // The plots that carry overhead. The Mango plot is excluded by the owner's
  // choice (plots.shares_overhead), and a plot with no surveyed area cannot
  // take an area share.
  const sharing = ledger.plots.filter((p) => p.active && p.sharesOverhead);

  const farmWide = ledger.expenses.filter(
    (e) =>
      e.attribution === "farm_wide" &&
      (opts.from === undefined || e.date >= opts.from) &&
      (opts.to === undefined || e.date <= opts.to),
  );

  for (const expense of farmWide) {
    pool += expense.amountCentavos;

    const split = splitByArea(
      expense.amountCentavos,
      sharing.map((p) => ({
        plotId: p.id,
        label: p.label,
        areaSqm: areaOn(ledger.plotAreas, p.id, expense.date),
      })),
    );

    if (split.lines.length === 0) {
      unallocated += expense.amountCentavos;
      continue;
    }

    for (const line of split.lines) {
      // Two cycles can share a plot over time but never on the same day, so
      // at most one of them can claim this plot's share.
      const cycle = ledger.cycles.find(
        (c) => c.plotId === line.plotId && cycleIsLiveOn(c, expense.date),
      );
      if (cycle) {
        byCycle.set(cycle.id, (byCycle.get(cycle.id) ?? 0) + line.amountCentavos);
      } else {
        byIdlePlot.set(
          line.plotId,
          (byIdlePlot.get(line.plotId) ?? 0) + line.amountCentavos,
        );
      }
    }
  }

  return { poolCentavos: pool, byCycle, byIdlePlot, unallocatedCentavos: unallocated };
}

/**
 * What an idle plot cost the farm in overhead while it sat empty. This is the
 * figure that answers "what is not planting this plot costing us?".
 */
export function idlePlotOverhead(
  ledger: Ledger,
  opts: { from?: ISODate; to?: ISODate } = {},
): { plotId: string; plotLabel: string; amountCentavos: Centavos }[] {
  const { byIdlePlot } = allocateFarmWide(ledger, opts);
  const label = new Map(ledger.plots.map((p) => [p.id, p.label]));
  return [...byIdlePlot.entries()]
    .map(([plotId, amountCentavos]) => ({
      plotId,
      plotLabel: label.get(plotId) ?? plotId,
      amountCentavos,
    }))
    .sort((a, b) => b.amountCentavos - a.amountCentavos);
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
