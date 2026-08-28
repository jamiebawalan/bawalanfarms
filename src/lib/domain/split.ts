import type { Centavos } from "./money";

/**
 * Apportioning a shared cost across plots by area.
 *
 * This preserves the family's existing convention. Two things matter beyond
 * getting the ratio right:
 *
 *  1. The parts must add back to the whole, exactly. The database rejects a
 *     split whose lines do not total the amount entered, so naive rounding of
 *     each share independently would lose or invent centavos and fail the save.
 *     Largest-remainder apportionment fixes that: floor every share, then hand
 *     the leftover centavos out one at a time to whoever was rounded down
 *     hardest.
 *
 *  2. A plot with no surveyed area cannot take a share. The coffee plot has no
 *     area yet, and treating "unknown" as zero would quietly hand its share to
 *     the other plots. It is reported as a problem instead.
 */

export type PlotAreaInput = {
  plotId: string;
  label: string;
  /** Square metres in force on the expense date, or null if never surveyed. */
  areaSqm: number | null;
};

export type SplitLine = {
  plotId: string;
  label: string;
  areaSqm: number;
  amountCentavos: Centavos;
  /** Share of the total, 0..1. For showing "38% of ₱4,500" on the preview. */
  fraction: number;
};

export type SplitResult = {
  lines: SplitLine[];
  /** Plots that could not take a share, and why. Shown, never swallowed. */
  excluded: { plotId: string; label: string; reason: string }[];
  totalCentavos: Centavos;
};

export function splitByArea(
  totalCentavos: Centavos,
  plots: readonly PlotAreaInput[],
): SplitResult {
  const excluded: SplitResult["excluded"] = [];
  const eligible: (PlotAreaInput & { areaSqm: number })[] = [];

  for (const p of plots) {
    if (p.areaSqm === null || !Number.isFinite(p.areaSqm) || p.areaSqm <= 0) {
      excluded.push({
        plotId: p.plotId,
        label: p.label,
        reason: "no surveyed area on this date, so it cannot take an area share",
      });
    } else {
      eligible.push({ ...p, areaSqm: p.areaSqm });
    }
  }

  const totalArea = eligible.reduce((a, p) => a + p.areaSqm, 0);
  if (eligible.length === 0 || totalArea <= 0) {
    return { lines: [], excluded, totalCentavos };
  }

  // Floor first, remember what each plot lost to the rounding.
  const provisional = eligible.map((p) => {
    const exact = (totalCentavos * p.areaSqm) / totalArea;
    const floored = Math.floor(exact);
    return { plot: p, floored, remainder: exact - floored };
  });

  let leftover = totalCentavos - provisional.reduce((a, r) => a + r.floored, 0);

  // Hand the leftover centavos to the biggest losers first. Ties go to the
  // larger plot, then to the earlier one, so the same input always splits the
  // same way — an expense that is edited and re-saved must not shuffle.
  const order = [...provisional].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      b.plot.areaSqm - a.plot.areaSqm ||
      a.plot.plotId.localeCompare(b.plot.plotId),
  );
  const bonus = new Map<string, number>();
  for (let i = 0; leftover > 0 && i < order.length; i++, leftover--) {
    const row = order[i]!;
    bonus.set(row.plot.plotId, (bonus.get(row.plot.plotId) ?? 0) + 1);
  }

  const lines = provisional.map(({ plot, floored }) => ({
    plotId: plot.plotId,
    label: plot.label,
    areaSqm: plot.areaSqm,
    amountCentavos: floored + (bonus.get(plot.plotId) ?? 0),
    fraction: plot.areaSqm / totalArea,
  }));

  return { lines, excluded, totalCentavos };
}

/**
 * A split the farm manager has edited by hand. He is allowed to overrule the
 * area maths — he was standing in the plot and we were not — but the parts
 * still have to add to the whole, so the form can tell him how far out he is
 * before the database refuses the save.
 */
export function checkManualSplit(
  totalCentavos: Centavos,
  lines: readonly { amountCentavos: Centavos }[],
): { ok: true } | { ok: false; differenceCentavos: Centavos } {
  const allocated = lines.reduce((a, l) => a + l.amountCentavos, 0);
  const difference = totalCentavos - allocated;
  return difference === 0 ? { ok: true } : { ok: false, differenceCentavos: difference };
}


/**
 * Apportioning by a set of percentages the farm manager chose himself.
 *
 * Area is a fair default for a cost nobody watched being spent, and it is what
 * the historical figures were built on. But he was standing in the plot: if the
 * crew spent the morning on 24 and an hour on 2, he knows that and the areas do
 * not. So the percentages are his to set, and the area split is only where the
 * form starts.
 *
 * The parts still have to add back to the whole — the database refuses a split
 * that does not — so the same largest-remainder handling applies to whatever
 * percentages he lands on.
 */
export function splitByPercent(
  totalCentavos: Centavos,
  parts: readonly { plotId: string; label: string; percent: number }[],
): SplitResult {
  const usable = parts.filter((p) => Number.isFinite(p.percent) && p.percent > 0);
  const totalPercent = usable.reduce((a, p) => a + p.percent, 0);

  if (usable.length === 0 || totalPercent <= 0) {
    return {
      lines: [],
      excluded: parts.map((p) => ({
        plotId: p.plotId,
        label: p.label,
        reason: "no share given",
      })),
      totalCentavos,
    };
  }

  const provisional = usable.map((p) => {
    const exact = (totalCentavos * p.percent) / totalPercent;
    const floored = Math.floor(exact);
    return { part: p, floored, remainder: exact - floored };
  });

  let leftover = totalCentavos - provisional.reduce((a, r) => a + r.floored, 0);
  const order = [...provisional].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      b.part.percent - a.part.percent ||
      a.part.plotId.localeCompare(b.part.plotId),
  );
  const bonus = new Map<string, number>();
  for (let i = 0; leftover > 0 && i < order.length; i++, leftover--) {
    const row = order[i]!;
    bonus.set(row.part.plotId, (bonus.get(row.part.plotId) ?? 0) + 1);
  }

  return {
    lines: provisional.map(({ part, floored }) => ({
      plotId: part.plotId,
      label: part.label,
      areaSqm: 0,
      amountCentavos: floored + (bonus.get(part.plotId) ?? 0),
      fraction: part.percent / totalPercent,
    })),
    excluded: parts
      .filter((p) => !usable.includes(p))
      .map((p) => ({ plotId: p.plotId, label: p.label, reason: "no share given" })),
    totalCentavos,
  };
}

/** The area-based percentages the form opens with. */
export function areaPercentages(
  plots: readonly PlotAreaInput[],
): { plotId: string; percent: number }[] {
  const withArea = plots.filter(
    (p): p is PlotAreaInput & { areaSqm: number } =>
      p.areaSqm !== null && p.areaSqm > 0,
  );
  const total = withArea.reduce((a, p) => a + p.areaSqm, 0);
  if (total <= 0) return plots.map((p) => ({ plotId: p.plotId, percent: 0 }));
  return plots.map((p) => ({
    plotId: p.plotId,
    percent:
      p.areaSqm !== null && p.areaSqm > 0
        ? Math.round((p.areaSqm / total) * 1000) / 10
        : 0,
  }));
}
