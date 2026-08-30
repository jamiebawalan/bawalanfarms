/**
 * The plot-cycle history, as a file the farm can read without the app.
 *
 * This is deliberately not the briefing that goes to Claude. That one is
 * trimmed to what helps a model decide something this week. This one is the
 * record: every expense, every reading, every harvest and sale, in full, so
 * that someone opening the folder in five years — or opening it because the app
 * has stopped working — has the whole cycle in front of them.
 *
 * Markdown because it reads fine as plain text on a phone, opens in Drive
 * without converting, and diffs sensibly when the mirror rewrites it.
 */

import { cyclePnL } from "./pnl";
import { latestLeaf, projectForcing, projectHarvest } from "./dashboards";
import { formatDate, todayISO } from "./dates";
import { formatPeso, formatPesoPrecise } from "./money";
import type { ISODate, Ledger } from "./types";

export function cycleDossier(
  ledger: Ledger,
  cycleId: string,
  today: ISODate = todayISO(),
): { name: string; folder: string; markdown: string } | null {
  const pnl = cyclePnL(ledger, cycleId);
  if (pnl === null) return null;

  const { cycle, plot } = pnl;
  const label = plot?.label ?? "Unknown plot";
  const started = cycle.dateStarted ?? cycle.datePlanted ?? "undated";
  const activity = new Map(ledger.activities.map((a) => [a.code, a.label]));
  const product = new Map(ledger.products.map((p) => [p.code, p.label]));
  const buyer = new Map(ledger.buyers.map((b) => [b.id, b.name]));
  const out: string[] = [];

  const h = (text: string) => { out.push("", `## ${text}`, ""); };
  const row = (cells: (string | number)[]) => out.push(`| ${cells.join(" | ")} |`);
  const head = (cells: string[]) => {
    row(cells);
    row(cells.map(() => "---"));
  };

  out.push(`# ${label} — ${cycle.crop}, started ${formatDate(started)}`);
  out.push("");
  out.push(`_Written by Farm Tracker on ${formatDate(today)}. Anything you change here will be overwritten next time it writes; change it in the app instead._`);

  h("The cycle");
  head(["", ""]);
  row(["Plot", label]);
  row(["Crop", cycle.crop]);
  row(["Stage", cycle.status.replace(/_/g, " ")]);
  row(["Area", pnl.areaSqm === null ? "not recorded" : `${pnl.areaSqm.toLocaleString("en-PH")} sqm`]);
  row(["Cycle started", cycle.dateStarted === null ? "not recorded" : formatDate(cycle.dateStarted)]);
  row(["Planted", cycle.datePlanted === null ? "not recorded" : formatDate(cycle.datePlanted)]);
  if (cycle.dateClosed !== null) row(["Closed", formatDate(cycle.dateClosed)]);
  row([
    "Plants",
    pnl.plantCount === null
      ? "no count recorded"
      : `${pnl.plantCount.toLocaleString("en-PH")} (counted ${formatDate(pnl.plantCountDate)})`,
  ]);

  h("Money");
  head(["", ""]);
  row(["Total cost", formatPeso(pnl.totalCostCentavos)]);
  row(["  Direct", formatPeso(pnl.directCostCentavos)]);
  row(["  Inputs drawn", formatPeso(pnl.inputDrawCostCentavos)]);
  row(["  Share of overhead", formatPeso(pnl.farmWideShareCentavos)]);
  row(["Revenue", formatPeso(pnl.revenueCentavos)]);
  row(["Gross margin", formatPeso(pnl.grossMarginCentavos)]);
  if (pnl.costPerPlantCentavos !== null) {
    row(["Cost per plant", formatPesoPrecise(pnl.costPerPlantCentavos)]);
  }
  if (pnl.marginPerUnitSoldCentavos !== null) {
    row(["Margin per fruit sold", formatPesoPrecise(pnl.marginPerUnitSoldCentavos)]);
  }

  if (pnl.costByCategory.length > 0) {
    h("Cost by category");
    head(["Category", "Amount"]);
    for (const c of pnl.costByCategory) row([c.category, formatPeso(c.amountCentavos)]);
  }

  if (pnl.costByActivity.length > 0) {
    h("Cost by activity");
    head(["Activity", "Amount"]);
    for (const c of pnl.costByActivity) {
      row([activity.get(c.activity) ?? c.activity, formatPeso(c.amountCentavos)]);
    }
  }

  // --- D-leaf ---------------------------------------------------------------
  const readings = ledger.leafMeasurements
    .filter((l) => l.cycleId === cycleId)
    .sort((a, b) => a.date.localeCompare(b.date));
  h("D-leaf measurements");
  if (readings.length === 0) {
    out.push("None recorded.");
  } else {
    head(["Date", "Average", "Plants measured"]);
    for (const r of readings) {
      row([formatDate(r.date), `${r.avgLengthCm} cm`, r.sampleSize ?? ledger.settings.dleafSampleSize]);
    }
    out.push("");
    const forcing = projectForcing(ledger, cycleId);
    const latest = latestLeaf(ledger, cycleId);
    if (latest !== null) {
      const short = ledger.settings.dleafForcingCm - latest.avgLengthCm;
      out.push(
        short <= 0
          ? `The latest reading is at or past the ${ledger.settings.dleafForcingCm} cm forcing length.`
          : `${Math.round(short * 10) / 10} cm short of the ${ledger.settings.dleafForcingCm} cm forcing length.`,
      );
    }
    if (forcing === null) {
      out.push("No growth rate yet — that needs at least two readings.");
    } else {
      out.push(`Growing ${forcing.cmPerDay} cm a day. Forcing projected for ${formatDate(forcing.date)}.`);
    }
    const harvest = projectHarvest(ledger, cycleId, today);
    if (harvest !== null) out.push(`Harvest projected for ${formatDate(harvest)}.`);
  }
  if (cycle.targetForcingDate !== null) {
    out.push(`Target forcing date: ${formatDate(cycle.targetForcingDate)}.`);
  }
  if (cycle.targetHarvestDate !== null) {
    out.push(`Target harvest date: ${formatDate(cycle.targetHarvestDate)}.`);
  }

  // --- spend ----------------------------------------------------------------
  const mine = new Map(
    ledger.allocations.filter((a) => a.cycleId === cycleId).map((a) => [a.expenseId, a]),
  );
  const spend = ledger.expenses
    .filter((e) => mine.has(e.id))
    .sort((a, b) => a.date.localeCompare(b.date));
  h("Every cost charged to this cycle");
  if (spend.length === 0) {
    out.push("None yet.");
  } else {
    head(["Date", "Activity", "Category", "Paid to", "Charged here"]);
    for (const e of spend) {
      row([
        formatDate(e.date),
        activity.get(e.activity) ?? e.activity,
        e.category,
        e.paidTo ?? "",
        formatPeso(mine.get(e.id)!.amountCentavos),
      ]);
    }
  }

  const draws = ledger.draws
    .filter((d) => d.cycleId === cycleId)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (draws.length > 0) {
    const purchase = new Map(ledger.purchases.map((p) => [p.id, p]));
    h("Inputs drawn onto this plot");
    head(["Date", "Input", "Quantity", "Cost", "Note"]);
    for (const d of draws) {
      const p = purchase.get(d.purchaseId);
      row([
        formatDate(d.date),
        p?.inputType ?? "unknown",
        `${d.quantity} ${p?.unit ?? ""}`.trim(),
        p === undefined ? "" : formatPeso(Math.round(d.quantity * p.unitCostCentavos)),
        d.doseNote ?? "",
      ]);
    }
  }

  // --- harvest and sales ----------------------------------------------------
  const harvests = ledger.harvests
    .filter((x) => x.cycleId === cycleId)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (harvests.length > 0) {
    h("Harvests");
    head(["Date", "Picked", "Note"]);
    for (const x of harvests) {
      const lines = ledger.harvestLines.filter((l) => l.harvestId === x.id);
      row([
        formatDate(x.date),
        lines.map((l) => `${l.quantity} ${product.get(l.product) ?? l.product}`).join(", "),
        x.note ?? "",
      ]);
    }
  }

  const sales = ledger.sales
    .filter((s) => s.cycleId === cycleId)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sales.length > 0) {
    h("Sales");
    head(["Date", "Buyer", "Sold", "Total"]);
    for (const s of sales) {
      const lines = ledger.saleLines.filter((l) => l.saleId === s.id);
      row([
        formatDate(s.date),
        buyer.get(s.buyerId) ?? "unknown",
        lines
          .map((l) => `${l.quantity} ${product.get(l.product) ?? l.product} @ ${formatPesoPrecise(l.unitPriceCentavos)}`)
          .join(", "),
        formatPeso(lines.reduce((sum, l) => sum + l.totalCentavos, 0)),
      ]);
    }
  }

  const counts = ledger.plantCounts
    .filter((c) => c.cycleId === cycleId)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (counts.length > 1) {
    h("Plant counts over time");
    head(["Date", "Count", "Note"]);
    for (const c of counts) row([formatDate(c.date), c.count.toLocaleString("en-PH"), c.note ?? ""]);
  }

  const tasks = ledger.tasks
    .filter((t) => t.cycleId === cycleId || (t.plotId !== null && t.plotId === cycle.plotId))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (tasks.length > 0) {
    h("Tasks");
    head(["Due", "Task", "Done"]);
    for (const t of tasks) {
      row([
        formatDate(t.dueDate),
        `${t.isCritical ? "**" : ""}${t.title}${t.isCritical ? "**" : ""}`,
        t.doneAt === null ? "" : "yes",
      ]);
    }
  }

  return {
    name: "History.md",
    folder: `${started} ${cycle.crop}`,
    markdown: out.join("\n") + "\n",
  };
}

/** The farm-level record: what has been decided, and what is still open. */
export function knowledgeDoc(
  brief: string,
  today: ISODate = todayISO(),
): { name: string; markdown: string } {
  return {
    name: "Decisions and open questions.md",
    markdown:
      `# What the farm knows\n\n_Written by Farm Tracker on ${formatDate(today)}._\n\n` +
      `This is the record behind every suggestion the app makes on a plot page.\n\n` +
      brief +
      "\n",
  };
}
