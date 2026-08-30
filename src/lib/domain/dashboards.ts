import { allCyclePnL, type CyclePnL } from "./pnl";
import { allocateFarmWide, cycleIsLiveOn, plotIsOccupiedOn } from "./allocation";
import { areaOn } from "./plots";
import { addDays, todayISO } from "./dates";
import type { Centavos } from "./money";
import type { ExpenseCategory, ISODate, Ledger } from "./types";

/**
 * The two dashboards.
 *
 * Every figure is shown for two windows — the last twelve months and the last
 * three — because on an 18-month pineapple cycle a single number is almost
 * always either stale or noise. The pair is what makes a trend readable.
 *
 * Where something cannot honestly be computed yet, these return null rather
 * than zero. A blank tile says "not measured"; a zero says "measured, and it
 * is nothing", and the two must never be confused on a screen someone steers
 * the farm by.
 */

export type Window = { from: ISODate; to: ISODate; label: string };

export function windows(today = todayISO()): { year: Window; quarter: Window } {
  return {
    year: { from: addDays(today, -365), to: today, label: "Last 12 months" },
    quarter: { from: addDays(today, -91), to: today, label: "Last 3 months" },
  };
}

const PINEAPPLE_GRADES = ["primera", "segunda", "tercera", "kwarta", "quinta"];

// --- owner dashboard -------------------------------------------------------

export type OwnerWindow = {
  label: string;
  revenueCentavos: Centavos;
  fruitSold: number;
  fruitHarvested: number;
  /** Fruit picked as a share of plants standing. Null until both are known. */
  harvestRate: number | null;
  avgRevenuePerFruitCentavos: Centavos | null;
  /** Grades sold, best first — the "indicative size" behind the average. */
  gradeMix: { product: string; quantity: number; share: number }[];
  avgCostPerFruitSoldCentavos: Centavos | null;
  costCentavos: Centavos;
  costDrivers: { category: ExpenseCategory; amountCentavos: Centavos; share: number }[];
};

export type OwnerDashboard = { year: OwnerWindow; quarter: OwnerWindow };

export function ownerDashboard(ledger: Ledger, today = todayISO()): OwnerDashboard {
  const w = windows(today);
  return {
    year: ownerWindow(ledger, w.year),
    quarter: ownerWindow(ledger, w.quarter),
  };
}

function ownerWindow(ledger: Ledger, window: Window): OwnerWindow {
  const inWindow = (d: ISODate) => d >= window.from && d <= window.to;
  const saleById = new Map(ledger.sales.map((s) => [s.id, s]));

  let revenue = 0;
  let fruitSold = 0;
  const byGrade = new Map<string, number>();

  for (const line of ledger.saleLines) {
    const sale = saleById.get(line.saleId);
    if (!sale || !inWindow(sale.date)) continue;
    if (!PINEAPPLE_GRADES.includes(line.product)) {
      revenue += line.totalCentavos;
      continue;
    }
    revenue += line.totalCentavos;
    fruitSold += line.quantity;
    byGrade.set(line.product, (byGrade.get(line.product) ?? 0) + line.quantity);
  }

  const harvestIds = new Set(
    ledger.harvests.filter((h) => inWindow(h.date)).map((h) => h.id),
  );
  let fruitHarvested = 0;
  for (const line of ledger.harvestLines) {
    if (harvestIds.has(line.harvestId) && PINEAPPLE_GRADES.includes(line.product)) {
      fruitHarvested += line.quantity;
    }
  }

  // Plants standing on pineapple cycles that were live at the end of the
  // window. The harvest rate is fruit picked against plants in the ground.
  let plantsStanding = 0;
  for (const cycle of ledger.cycles) {
    if (cycle.crop !== "pineapple" || !cycleIsLiveOn(cycle, window.to)) continue;
    const counts = ledger.plantCounts
      .filter((p) => p.cycleId === cycle.id && p.date <= window.to)
      .sort((a, b) => b.date.localeCompare(a.date));
    plantsStanding += counts[0]?.count ?? 0;
  }

  // Cost in the window, from the same three places a cycle's cost comes from.
  const expenseById = new Map(ledger.expenses.map((e) => [e.id, e]));
  const byCategory = new Map<ExpenseCategory, Centavos>();
  let cost = 0;

  for (const alloc of ledger.allocations) {
    const e = expenseById.get(alloc.expenseId);
    if (!e || !inWindow(e.date)) continue;
    cost += alloc.amountCentavos;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + alloc.amountCentavos);
  }
  const purchaseById = new Map(ledger.purchases.map((p) => [p.id, p]));
  for (const draw of ledger.draws) {
    if (!inWindow(draw.date)) continue;
    const purchase = purchaseById.get(draw.purchaseId);
    if (!purchase) continue;
    const drawn = Math.round(purchase.unitCostCentavos * draw.quantity);
    cost += drawn;
    byCategory.set("Farm Inputs", (byCategory.get("Farm Inputs") ?? 0) + drawn);
  }
  const overhead = allocateFarmWide(ledger, { from: window.from, to: window.to });
  cost += overhead.poolCentavos - overhead.unallocatedCentavos;

  const gradeTotal = [...byGrade.values()].reduce((a, b) => a + b, 0);
  const order = new Map(PINEAPPLE_GRADES.map((g, i) => [g, i]));

  return {
    label: window.label,
    revenueCentavos: revenue,
    fruitSold: round3(fruitSold),
    fruitHarvested: round3(fruitHarvested),
    harvestRate: plantsStanding > 0 ? fruitHarvested / plantsStanding : null,
    avgRevenuePerFruitCentavos:
      fruitSold > 0 ? Math.round(revenue / fruitSold) : null,
    gradeMix: [...byGrade.entries()]
      .map(([product, quantity]) => ({
        product,
        quantity: round3(quantity),
        share: gradeTotal > 0 ? quantity / gradeTotal : 0,
      }))
      .sort((a, b) => (order.get(a.product) ?? 99) - (order.get(b.product) ?? 99)),
    avgCostPerFruitSoldCentavos:
      fruitSold > 0 ? Math.round(cost / fruitSold) : null,
    costCentavos: cost,
    costDrivers: [...byCategory.entries()]
      .map(([category, amountCentavos]) => ({
        category,
        amountCentavos,
        share: cost > 0 ? amountCentavos / cost : 0,
      }))
      .sort((a, b) => b.amountCentavos - a.amountCentavos),
  };
}

// --- manager dashboard -----------------------------------------------------

export type LandUse = {
  totalSqm: number;
  plantedSqm: number;
  /** Planted area over total. The number to push towards 1. */
  utilisation: number;
  plantsStanding: number;
  plantsPotential: number;
  plantUtilisation: number | null;
  idlePlots: { plotId: string; label: string; areaSqm: number }[];
  /** The cycle queued to go in next, if one is planned. */
  nextPlanned: {
    plotId: string;
    label: string;
    crop: string;
    areaSqm: number | null;
  } | null;
  /** Where utilisation lands once the planned cycle is in the ground. */
  utilisationAfterNext: number | null;
};

export function landUse(ledger: Ledger, today = todayISO()): LandUse {
  const active = ledger.plots.filter((p) => p.active && p.sharesOverhead);
  let totalSqm = 0;
  let plantedSqm = 0;
  const idle: LandUse["idlePlots"] = [];

  for (const plot of active) {
    const area = areaOn(ledger.plotAreas, plot.id, today);
    if (area === null) continue;
    totalSqm += area;
    const live = ledger.cycles.some(
      (c) => c.plotId === plot.id && plotIsOccupiedOn(c, today),
    );
    if (live) plantedSqm += area;
    else idle.push({ plotId: plot.id, label: plot.label, areaSqm: area });
  }

  let plantsStanding = 0;
  for (const cycle of ledger.cycles) {
    if (!plotIsOccupiedOn(cycle, today)) continue;
    const counts = ledger.plantCounts
      .filter((p) => p.cycleId === cycle.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    plantsStanding += counts[0]?.count ?? 0;
  }

  const planned = ledger.cycles.find((c) => c.status === "planned") ?? null;
  const plannedPlot = planned
    ? ledger.plots.find((p) => p.id === planned.plotId) ?? null
    : null;
  const plannedArea = planned ? areaOn(ledger.plotAreas, planned.plotId, today) : null;

  const potential = Math.round(totalSqm * ledger.settings.targetPlantsPerSqm);

  return {
    totalSqm,
    plantedSqm,
    utilisation: totalSqm > 0 ? plantedSqm / totalSqm : 0,
    plantsStanding,
    plantsPotential: potential,
    plantUtilisation: potential > 0 ? plantsStanding / potential : null,
    idlePlots: idle.sort((a, b) => b.areaSqm - a.areaSqm),
    nextPlanned:
      planned && plannedPlot
        ? {
            plotId: plannedPlot.id,
            label: plannedPlot.label,
            crop: planned.crop,
            areaSqm: plannedArea,
          }
        : null,
    utilisationAfterNext:
      totalSqm > 0 && plannedArea !== null
        ? (plantedSqm + plannedArea) / totalSqm
        : null,
  };
}

export type PlotCostRow = {
  cycleId: string;
  plotLabel: string;
  crop: string;
  plants: number | null;
  costPerPlantCentavos: Centavos | null;
  totalCostCentavos: Centavos;
  /** The two drivers the manager can actually act on, plus the rest. */
  labourCentavos: Centavos;
  inputsCentavos: Centavos;
  otherCentavos: Centavos;
  latestDleafCm: number | null;
  latestDleafDate: ISODate | null;
  dleafReadings: number;
  /** cm a day, from the first reading to the last. */
  dleafGrowthPerDay: number | null;
  targetForcing: ISODate | null;
  projectedForcing: ISODate | null;
  /** Positive means forcing looks later than planned. */
  forcingSlipDays: number | null;
  targetHarvest: ISODate | null;
  projectedHarvest: ISODate | null;
  slipDays: number | null;
};

export function plotCostRanking(ledger: Ledger, today = todayISO()): PlotCostRow[] {
  return allCyclePnL(ledger)
    .filter((c) => !c.isClosed && c.cycle.status !== "planned" && c.cycle.crop === "pineapple")
    .map((c) => {
      const labour = amountFor(c, "Labor");
      const inputs = amountFor(c, "Farm Inputs");
      const leaf = latestLeaf(ledger, c.cycle.id);
      const forcing = projectForcing(ledger, c.cycle.id);
      const projected = projectHarvest(ledger, c.cycle.id, today);
      const readings = ledger.leafMeasurements.filter((l) => l.cycleId === c.cycle.id);
      return {
        cycleId: c.cycle.id,
        plotLabel: c.plot?.label ?? "Plot",
        crop: c.cycle.crop,
        plants: c.plantCount,
        costPerPlantCentavos: c.costPerPlantCentavos,
        totalCostCentavos: c.totalCostCentavos,
        labourCentavos: labour,
        inputsCentavos: inputs,
        otherCentavos: Math.max(0, c.totalCostCentavos - labour - inputs),
        latestDleafCm: leaf?.avgLengthCm ?? null,
        latestDleafDate: leaf?.date ?? null,
        dleafReadings: readings.length,
        dleafGrowthPerDay: forcing?.cmPerDay ?? null,
        targetForcing: c.cycle.targetForcingDate,
        projectedForcing: forcing?.date ?? null,
        forcingSlipDays:
          forcing !== null && c.cycle.targetForcingDate !== null
            ? daysApart(c.cycle.targetForcingDate, forcing.date)
            : null,
        targetHarvest: c.cycle.targetHarvestDate,
        projectedHarvest: projected,
        slipDays:
          projected !== null && c.cycle.targetHarvestDate !== null
            ? daysApart(c.cycle.targetHarvestDate, projected)
            : null,
      };
    })
    .sort((a, b) => (b.costPerPlantCentavos ?? -1) - (a.costPerPlantCentavos ?? -1));
}

function amountFor(pnl: CyclePnL, category: ExpenseCategory): Centavos {
  return pnl.costByCategory.find((r) => r.category === category)?.amountCentavos ?? 0;
}

export function latestLeaf(ledger: Ledger, cycleId: string) {
  return (
    ledger.leafMeasurements
      .filter((l) => l.cycleId === cycleId)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  );
}

/**
 * When this cycle will be ready to force.
 *
 * This is the decision the D-leaf readings exist to time. Anthony measures ten
 * plants at random every few weeks; two readings give a growth rate, and the
 * rate says when the plants reach the length at which liquid goes on to induce
 * fruiting.
 *
 * With one reading there is no rate, so there is no projection — a single
 * measurement says how big the plants are, not how fast they are growing, and
 * inventing a rate from it would put a confident date on a guess. Returns null
 * rather than pretend.
 */
export function projectForcing(
  ledger: Ledger,
  cycleId: string,
): { date: ISODate; cmPerDay: number; fromReadings: number } | null {
  const readings = ledger.leafMeasurements
    .filter((l) => l.cycleId === cycleId)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (readings.length < 2) return null;

  const first = readings[0]!;
  const last = readings[readings.length - 1]!;
  const days = daysApart(first.date, last.date);
  const grown = last.avgLengthCm - first.avgLengthCm;
  if (days <= 0 || grown <= 0) return null;

  const perDay = grown / days;
  const remaining = ledger.settings.dleafForcingCm - last.avgLengthCm;
  return {
    // Already big enough: it is ready now, not in the past.
    date: remaining <= 0 ? last.date : addDays(last.date, Math.ceil(remaining / perDay)),
    cmPerDay: Math.round(perDay * 1000) / 1000,
    fromReadings: readings.length,
  };
}

/**
 * When this cycle is likely to be harvested.
 *
 * Harvest follows forcing by a set number of months, so the D-leaf readings
 * reach it through the forcing date rather than predicting it directly. Where
 * there are not two readings to give a rate, it falls back to planting date
 * plus the farm's typical cycle length. With neither, null.
 */
export function projectHarvest(
  ledger: Ledger,
  cycleId: string,
  today = todayISO(),
): ISODate | null {
  const cycle = ledger.cycles.find((c) => c.id === cycleId);
  if (!cycle) return null;

  const forcing = projectForcing(ledger, cycleId);
  if (forcing !== null) {
    return addMonths(forcing.date, ledger.settings.monthsForcingToHarvest);
  }
  if (cycle.datePlanted !== null) {
    return addMonths(cycle.datePlanted, ledger.settings.pineappleMonthsToHarvest);
  }
  return null;
}

export type WeekTasks = {
  overdue: EnrichedTask[];
  thisWeek: EnrichedTask[];
  later: EnrichedTask[];
};

export type EnrichedTask = {
  id: string;
  title: string;
  dueDate: ISODate;
  isCritical: boolean;
  plotLabel: string | null;
};

export function tasksForWeek(ledger: Ledger, today = todayISO()): WeekTasks {
  const weekEnd = addDays(today, 7);
  const plotLabel = new Map(ledger.plots.map((p) => [p.id, p.label]));
  const open = ledger.tasks
    .filter((t) => t.doneAt === null)
    .map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      isCritical: t.isCritical,
      plotLabel: t.plotId === null ? null : plotLabel.get(t.plotId) ?? null,
    }))
    // Critical first, then by how soon it is due.
    .sort(
      (a, b) =>
        Number(b.isCritical) - Number(a.isCritical) ||
        a.dueDate.localeCompare(b.dueDate),
    );

  return {
    overdue: open.filter((t) => t.dueDate < today),
    thisWeek: open.filter((t) => t.dueDate >= today && t.dueDate <= weekEnd),
    later: open.filter((t) => t.dueDate > weekEnd),
  };
}

// --- helpers ---------------------------------------------------------------

function daysApart(from: ISODate, to: ISODate): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

function addMonths(iso: ISODate, months: number): ISODate {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return date.toISOString().slice(0, 10);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
