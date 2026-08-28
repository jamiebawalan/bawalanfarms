/**
 * What Claude is told about a plot.
 *
 * The suggestion feature is only as good as the facts it is given, so the
 * briefing is built here — as a pure function over the ledger — rather than
 * assembled inline in the route. That way what the model sees is something we
 * can read in a test and be sure of, instead of a string nobody ever looks at.
 *
 * Two rules shape it:
 *
 *  - Only what is measured. Where a figure is unknown the briefing says so in
 *    words. A model handed a silent zero will reason about a farm that spent
 *    nothing; a model told "no plant count recorded" will say to go and count.
 *  - Money in whole pesos. The model is being asked what to do next week, not
 *    to audit the books, and centavos in the prompt only invite it to quote
 *    false precision back.
 */

import { latestLeaf, projectForcing, projectHarvest } from "./dashboards";
import { cyclePnL } from "./pnl";
import { formatDate, todayISO } from "./dates";
import { formatPeso } from "./money";
import type { ISODate, Ledger } from "./types";

export type Briefing = {
  /** Shown to the manager as "this is what Claude was told". */
  text: string;
  plotLabel: string;
  /** True when there is enough here to be worth asking about at all. */
  isUseful: boolean;
};

export function cycleBriefing(
  ledger: Ledger,
  cycleId: string,
  today: ISODate = todayISO(),
): Briefing | null {
  const pnl = cyclePnL(ledger, cycleId);
  if (pnl === null) return null;

  const { cycle, plot } = pnl;
  const label = plot?.label ?? "this plot";
  const settings = ledger.settings;
  const lines: string[] = [];

  lines.push(`Today is ${formatDate(today)}.`);
  lines.push("");
  lines.push(`## ${label}`);
  lines.push(`Crop: ${cycle.crop}. Stage: ${cycle.status.replace("_", " ")}.`);
  lines.push(`Area: ${pnl.areaSqm === null ? "not recorded" : `${pnl.areaSqm.toLocaleString("en-PH")} sqm`}.`);
  lines.push(
    `Cycle started ${cycle.dateStarted === null ? "(not recorded)" : formatDate(cycle.dateStarted)}` +
      `; planted ${cycle.datePlanted === null ? "(not recorded)" : formatDate(cycle.datePlanted)}.`,
  );
  lines.push(
    pnl.plantCount === null
      ? "Plant count: none recorded for this cycle."
      : `Plant count: ${pnl.plantCount.toLocaleString("en-PH")} plants, counted ${formatDate(pnl.plantCountDate)}.`,
  );

  // --- D-leaf -------------------------------------------------------------
  const readings = ledger.leafMeasurements
    .filter((l) => l.cycleId === cycleId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = latestLeaf(ledger, cycleId);
  const forcing = projectForcing(ledger, cycleId);

  lines.push("");
  lines.push("## D-leaf measurements");
  lines.push(
    `Anthony measures the D-leaf of ${settings.dleafSampleSize} randomly chosen plants every few weeks. ` +
      `The plants are forced with liquid to induce fruiting once the D-leaf averages ${settings.dleafForcingCm} cm; ` +
      `harvest follows forcing by about ${settings.monthsForcingToHarvest} months.`,
  );
  if (readings.length === 0) {
    lines.push("No D-leaf readings have been recorded on this cycle.");
  } else {
    for (const r of readings) {
      lines.push(`- ${formatDate(r.date)}: ${r.avgLengthCm} cm average (${r.sampleSize ?? settings.dleafSampleSize} plants)`);
    }
    if (latest !== null) {
      const short = settings.dleafForcingCm - latest.avgLengthCm;
      lines.push(
        short <= 0
          ? "The latest reading is at or past the forcing length."
          : `${round1(short)} cm short of the forcing length.`,
      );
    }
  }
  if (forcing === null) {
    lines.push(
      readings.length < 2
        ? "Growth rate: unknown — a rate needs at least two readings, so there is no forcing date yet."
        : "Growth rate: could not be computed from the readings on file.",
    );
  } else {
    lines.push(`Growth rate: ${forcing.cmPerDay} cm a day across ${forcing.fromReadings} readings.`);
    lines.push(`Projected forcing: ${formatDate(forcing.date)}.`);
  }
  lines.push(
    cycle.targetForcingDate === null
      ? "Target forcing date: not set."
      : `Target forcing date: ${formatDate(cycle.targetForcingDate)}.`,
  );
  const harvest = projectHarvest(ledger, cycleId, today);
  if (harvest !== null) lines.push(`Projected harvest: ${formatDate(harvest)}.`);
  if (cycle.targetHarvestDate !== null) {
    lines.push(`Target harvest date: ${formatDate(cycle.targetHarvestDate)}.`);
  }

  // --- money --------------------------------------------------------------
  lines.push("");
  lines.push("## Cost and revenue so far");
  lines.push(`Total cost: ${formatPeso(pnl.totalCostCentavos)}.`);
  if (pnl.costPerPlantCentavos !== null) {
    lines.push(`Cost per plant: ${formatPeso(pnl.costPerPlantCentavos)}.`);
  }
  if (pnl.costByCategory.length > 0) {
    lines.push("By category:");
    for (const row of pnl.costByCategory) {
      lines.push(`- ${row.category}: ${formatPeso(row.amountCentavos)}`);
    }
  }
  const activityLabel = new Map(ledger.activities.map((a) => [a.code, a.label]));
  const topActivities = pnl.costByActivity.slice(0, 8);
  if (topActivities.length > 0) {
    lines.push("Biggest activities:");
    for (const row of topActivities) {
      lines.push(`- ${activityLabel.get(row.activity) ?? row.activity}: ${formatPeso(row.amountCentavos)}`);
    }
  }
  lines.push(
    pnl.revenueCentavos === 0
      ? "Nothing sold off this cycle yet."
      : `Revenue so far: ${formatPeso(pnl.revenueCentavos)} from ${pnl.quantitySold.toLocaleString("en-PH")} sold.`,
  );

  // --- recent work --------------------------------------------------------
  const recent = recentWork(ledger, cycleId, today);
  lines.push("");
  lines.push("## Work done recently");
  if (recent.length === 0) {
    lines.push("Nothing logged against this cycle in the last 90 days.");
  } else {
    for (const r of recent) lines.push(`- ${formatDate(r.date)}: ${r.what}`);
  }

  // --- what is already planned -------------------------------------------
  const open = ledger.tasks
    .filter(
      (t) =>
        t.doneAt === null &&
        (t.cycleId === cycleId || (t.plotId !== null && t.plotId === cycle.plotId)),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  lines.push("");
  lines.push("## Tasks already on the list for this plot");
  if (open.length === 0) {
    lines.push("None.");
  } else {
    for (const t of open) {
      lines.push(`- ${t.title} (due ${formatDate(t.dueDate)}${t.isCritical ? ", critical" : ""})`);
    }
  }

  return {
    text: lines.join("\n"),
    plotLabel: label,
    // Something to reason from: either a reading, or work and money on the plot.
    isUseful: readings.length > 0 || pnl.totalCostCentavos > 0 || recent.length > 0,
  };
}

function recentWork(ledger: Ledger, cycleId: string, today: ISODate) {
  const since = shift(today, -90);
  const activityLabel = new Map(ledger.activities.map((a) => [a.code, a.label]));
  const allocated = new Set(
    ledger.allocations.filter((a) => a.cycleId === cycleId).map((a) => a.expenseId),
  );
  const rows: { date: ISODate; what: string }[] = [];

  for (const e of ledger.expenses) {
    if (!allocated.has(e.id) || e.date < since) continue;
    rows.push({
      date: e.date,
      what: `${activityLabel.get(e.activity) ?? e.activity} — ${formatPeso(e.amountCentavos)}`,
    });
  }
  const purchase = new Map(ledger.purchases.map((p) => [p.id, p]));
  for (const d of ledger.draws) {
    if (d.cycleId !== cycleId || d.date < since) continue;
    const p = purchase.get(d.purchaseId);
    rows.push({
      date: d.date,
      what: `drew ${d.quantity} ${p?.unit ?? ""} ${p?.inputType ?? "input"}${d.doseNote ? ` (${d.doseNote})` : ""}`.trim(),
    });
  }
  for (const h of ledger.harvests) {
    if (h.cycleId !== cycleId || h.date < since) continue;
    const qty = ledger.harvestLines
      .filter((l) => l.harvestId === h.id)
      .reduce((sum, l) => sum + l.quantity, 0);
    rows.push({ date: h.date, what: `harvested ${qty.toLocaleString("en-PH")}` });
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);
}

function shift(iso: ISODate, days: number): ISODate {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
