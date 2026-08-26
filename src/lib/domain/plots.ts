import type { ISODate, Plot, PlotArea } from "./types";

/**
 * The plot's area in force on a given date.
 *
 * Areas are effective-dated so that re-surveying a plot does not retroactively
 * change how a two-year-old expense was split. Returns null for a plot that has
 * never been surveyed — the coffee plot, today — because "unknown" and "zero"
 * must not be the same answer.
 */
export function areaOn(
  areas: readonly PlotArea[],
  plotId: string,
  onDate: ISODate,
): number | null {
  let best: PlotArea | null = null;
  for (const a of areas) {
    if (a.plotId !== plotId) continue;
    if (a.effectiveFrom <= onDate && (best === null || a.effectiveFrom > best.effectiveFrom)) {
      best = a;
    }
  }
  return best?.areaSqm ?? null;
}

/** Plots with no surveyed area, so the app can nag rather than guess. */
export function plotsMissingArea(
  plots: readonly Plot[],
  areas: readonly PlotArea[],
  onDate: ISODate,
): Plot[] {
  return plots.filter((p) => p.active && areaOn(areas, p.id, onDate) === null);
}
