import { allocateFarmWide } from "./allocation";
import { plantCountAsOf } from "./dosing";
import type { Centavos } from "./money";
import type {
  Cycle, ExpenseCategory, ISODate, Ledger, Plot,
} from "./types";

/**
 * Cycle P&L — the question the whole app exists to answer:
 * for a given plot and crop cycle, did we make money?
 *
 * Costs reaching a cycle come from three places, and only three:
 *   1. expense allocations tagged to the cycle (direct and split entries)
 *   2. input draws — stock leaving a bulk lot. Buying is not a cost; drawing is,
 *      so the 250-sack fertiliser lot lands on the cycles that consumed it
 *      rather than in a single unattributed heap
 *   3. this cycle's area share of the farm-wide overhead pool
 *
 * Capital never reaches a cycle. Buying a chainsaw is not a cost of growing
 * this pineapple; it is depreciated separately.
 */

export type ProductTotal = {
  product: string;
  quantity: number;
  revenueCentavos: Centavos;
  /** Revenue divided by quantity — the price actually realised, not a list price. */
  averagePriceCentavos: Centavos | null;
};

export type CyclePnL = {
  cycle: Cycle;
  plot: Plot | null;
  areaSqm: number | null;

  directCostCentavos: Centavos;
  inputDrawCostCentavos: Centavos;
  farmWideShareCentavos: Centavos;
  /** The tenant's share of the crop on a kasama plot, treated as a cost. */
  kasamaShareCentavos: Centavos;
  totalCostCentavos: Centavos;

  revenueCentavos: Centavos;
  grossMarginCentavos: Centavos;
  /** Margin over revenue. Null when nothing has been sold yet. */
  marginRatio: number | null;

  costByCategory: { category: ExpenseCategory; amountCentavos: Centavos }[];
  costByActivity: { activity: string; amountCentavos: Centavos }[];
  revenueByProduct: ProductTotal[];

  plantCount: number | null;
  plantCountDate: ISODate | null;
  costPerPlantCentavos: Centavos | null;

  quantityHarvested: number;
  quantitySold: number;
  /** Picked but never sold: spoilage or giveaway. Surfaced, not hidden. */
  quantityUnsold: number;
  costPerUnitHarvestedCentavos: Centavos | null;
  marginPerUnitSoldCentavos: Centavos | null;

  isClosed: boolean;
};

export function cyclePnL(ledger: Ledger, cycleId: string, asOf?: ISODate): CyclePnL | null {
  const cycle = ledger.cycles.find((c) => c.id === cycleId);
  if (!cycle) return null;
  return buildCyclePnL(ledger, cycle, allocateFarmWide(ledger).byCycle, asOf);
}

/** Every cycle at once, so the farm-wide pool is allocated a single time. */
export function allCyclePnL(ledger: Ledger, asOf?: ISODate): CyclePnL[] {
  const overhead = allocateFarmWide(ledger).byCycle;
  return ledger.cycles.map((c) => buildCyclePnL(ledger, c, overhead, asOf));
}

function buildCyclePnL(
  ledger: Ledger,
  cycle: Cycle,
  overheadByCycle: Map<string, Centavos>,
  asOf?: ISODate,
): CyclePnL {
  const within = (d: ISODate) => asOf === undefined || d <= asOf;
  const plot = ledger.plots.find((p) => p.id === cycle.plotId) ?? null;

  // --- costs ---------------------------------------------------------------
  const expenseById = new Map(ledger.expenses.map((e) => [e.id, e]));
  const byCategory = new Map<ExpenseCategory, Centavos>();
  const byActivity = new Map<string, Centavos>();
  let directCost = 0;

  for (const alloc of ledger.allocations) {
    if (alloc.cycleId !== cycle.id) continue;
    const expense = expenseById.get(alloc.expenseId);
    if (!expense || !within(expense.date)) continue;
    directCost += alloc.amountCentavos;
    byCategory.set(
      expense.category,
      (byCategory.get(expense.category) ?? 0) + alloc.amountCentavos,
    );
    byActivity.set(
      expense.activity,
      (byActivity.get(expense.activity) ?? 0) + alloc.amountCentavos,
    );
  }

  const purchaseById = new Map(ledger.purchases.map((p) => [p.id, p]));
  let drawCost = 0;
  for (const draw of ledger.draws) {
    if (draw.cycleId !== cycle.id || !within(draw.date)) continue;
    const purchase = purchaseById.get(draw.purchaseId);
    if (!purchase) continue;
    const cost = Math.round(purchase.unitCostCentavos * draw.quantity);
    drawCost += cost;
    // Drawn stock is a farm input by nature, and reads under the activity that
    // names the fertiliser, so the cost breakdown stays comparable to entries
    // logged directly as expenses.
    byCategory.set("Farm Inputs", (byCategory.get("Farm Inputs") ?? 0) + cost);
    byActivity.set(purchase.inputType, (byActivity.get(purchase.inputType) ?? 0) + cost);
  }

  const farmWideShare = overheadByCycle.get(cycle.id) ?? 0;

  // --- revenue -------------------------------------------------------------
  const saleById = new Map(ledger.sales.map((s) => [s.id, s]));
  const revenueByProduct = new Map<string, { quantity: number; revenue: Centavos }>();
  let revenue = 0;
  let quantitySold = 0;

  for (const line of ledger.saleLines) {
    const sale = saleById.get(line.saleId);
    if (!sale || sale.cycleId !== cycle.id || !within(sale.date)) continue;
    revenue += line.totalCentavos;
    quantitySold += line.quantity;
    const row = revenueByProduct.get(line.product) ?? { quantity: 0, revenue: 0 };
    row.quantity += line.quantity;
    row.revenue += line.totalCentavos;
    revenueByProduct.set(line.product, row);
  }

  // A kasama plot is worked by a tenant who takes a share of the crop. That
  // share is real revenue the farm never receives, so it is carried as a cost
  // line rather than netted out of the revenue figure — the owners can then see
  // both what the plot produced and what the arrangement cost. See DECISIONS.md.
  const kasamaShare =
    cycle.kasamaSharePct === null || cycle.kasamaSharePct === 0
      ? 0
      : Math.round((revenue * cycle.kasamaSharePct) / 100);

  const totalCost = directCost + drawCost + farmWideShare + kasamaShare;
  const grossMargin = revenue - totalCost;

  // --- harvest vs sold -----------------------------------------------------
  const harvestIds = new Set(
    ledger.harvests.filter((h) => h.cycleId === cycle.id && within(h.date)).map((h) => h.id),
  );
  let quantityHarvested = 0;
  for (const line of ledger.harvestLines) {
    if (harvestIds.has(line.harvestId)) quantityHarvested += line.quantity;
  }

  // --- plants --------------------------------------------------------------
  const counts = ledger.plantCounts
    .filter((p) => p.cycleId === cycle.id)
    .map((p) => ({ date: p.date, count: p.count }));
  const observed = plantCountAsOf(counts, asOf ?? "9999-12-31");

  const areaSqm = latestAreaFor(ledger, cycle);

  return {
    cycle,
    plot,
    areaSqm,
    directCostCentavos: directCost,
    inputDrawCostCentavos: drawCost,
    farmWideShareCentavos: farmWideShare,
    kasamaShareCentavos: kasamaShare,
    totalCostCentavos: totalCost,
    revenueCentavos: revenue,
    grossMarginCentavos: grossMargin,
    marginRatio: revenue === 0 ? null : grossMargin / revenue,
    costByCategory: [...byCategory.entries()]
      .map(([category, amountCentavos]) => ({ category, amountCentavos }))
      .sort((a, b) => b.amountCentavos - a.amountCentavos),
    costByActivity: [...byActivity.entries()]
      .map(([activity, amountCentavos]) => ({ activity, amountCentavos }))
      .sort((a, b) => b.amountCentavos - a.amountCentavos),
    revenueByProduct: [...revenueByProduct.entries()]
      .map(([product, r]) => ({
        product,
        quantity: r.quantity,
        revenueCentavos: r.revenue,
        averagePriceCentavos: r.quantity === 0 ? null : Math.round(r.revenue / r.quantity),
      }))
      .sort((a, b) => b.revenueCentavos - a.revenueCentavos),
    plantCount: observed?.count ?? null,
    plantCountDate: observed?.date ?? null,
    costPerPlantCentavos:
      observed && observed.count > 0 ? Math.round(totalCost / observed.count) : null,
    quantityHarvested: round3(quantityHarvested),
    quantitySold: round3(quantitySold),
    quantityUnsold: round3(quantityHarvested - quantitySold),
    costPerUnitHarvestedCentavos:
      quantityHarvested > 0 ? Math.round(totalCost / quantityHarvested) : null,
    marginPerUnitSoldCentavos:
      quantitySold > 0 ? Math.round(grossMargin / quantitySold) : null,
    isClosed: cycle.status === "closed",
  };
}

function latestAreaFor(ledger: Ledger, cycle: Cycle): number | null {
  const on = cycle.dateClosed ?? todayISO();
  let best: { effectiveFrom: ISODate; areaSqm: number } | null = null;
  for (const a of ledger.plotAreas) {
    if (a.plotId !== cycle.plotId) continue;
    if (a.effectiveFrom <= on && (best === null || a.effectiveFrom > best.effectiveFrom)) {
      best = a;
    }
  }
  return best?.areaSqm ?? null;
}

function todayISO(): ISODate {
  return new Date().toISOString().slice(0, 10);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Costs that landed on a plot with no cycle open at the time.
 *
 * The money is not lost — it still belongs to the plot — but it reaches no
 * P&L, so it has to be visible. This is the report that stops the app quietly
 * repeating the spreadsheet's central failure.
 */
export function unattachedCosts(ledger: Ledger): {
  plotId: string;
  plotLabel: string;
  amountCentavos: Centavos;
  count: number;
}[] {
  const plotById = new Map(ledger.plots.map((p) => [p.id, p]));
  const byPlot = new Map<string, { amountCentavos: Centavos; count: number }>();

  for (const alloc of ledger.allocations) {
    if (alloc.cycleId !== null) continue;
    const row = byPlot.get(alloc.plotId) ?? { amountCentavos: 0, count: 0 };
    row.amountCentavos += alloc.amountCentavos;
    row.count += 1;
    byPlot.set(alloc.plotId, row);
  }

  return [...byPlot.entries()]
    .map(([plotId, row]) => ({
      plotId,
      plotLabel: plotById.get(plotId)?.label ?? plotId,
      ...row,
    }))
    .sort((a, b) => b.amountCentavos - a.amountCentavos);
}


/**
 * What this cycle looks like it will make, if the plants standing sell at a
 * price the owner names.
 *
 * Deliberately crude and deliberately explicit. It takes one assumption — the
 * revenue expected per plant — and shows the arithmetic, because a projection
 * whose workings are hidden gets believed more than it deserves. Costs to date
 * are real; everything to the right of them is the owner's estimate.
 */
export type ProjectedProfit = {
  plants: number;
  revenuePerPlantCentavos: Centavos;
  projectedRevenueCentavos: Centavos;
  costToDateCentavos: Centavos;
  revenueSoFarCentavos: Centavos;
  projectedProfitCentavos: Centavos;
  /** Profit per plant, which is the number that compares across plots. */
  projectedPerPlantCentavos: Centavos;
};

export function projectProfit(
  pnl: CyclePnL,
  revenuePerPlantCentavos: Centavos,
): ProjectedProfit | null {
  if (pnl.plantCount === null || pnl.plantCount <= 0) return null;
  if (!Number.isFinite(revenuePerPlantCentavos) || revenuePerPlantCentavos < 0) return null;

  const projectedRevenue = Math.round(revenuePerPlantCentavos * pnl.plantCount);
  // Anything already sold is money in, so it is not projected twice.
  const total = projectedRevenue + pnl.revenueCentavos;
  const profit = total - pnl.totalCostCentavos;

  return {
    plants: pnl.plantCount,
    revenuePerPlantCentavos,
    projectedRevenueCentavos: projectedRevenue,
    costToDateCentavos: pnl.totalCostCentavos,
    revenueSoFarCentavos: pnl.revenueCentavos,
    projectedProfitCentavos: profit,
    projectedPerPlantCentavos: Math.round(profit / pnl.plantCount),
  };
}
