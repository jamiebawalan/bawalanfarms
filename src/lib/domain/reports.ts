import { allCyclePnL, type CyclePnL } from "./pnl";
import { overheadShare } from "./allocation";
import type { Centavos } from "./money";
import type {
  ExpenseCategory, ISODate, Ledger, Plot,
} from "./types";

/** ------------------------------------------------------------------------
 * Plot history — every cycle a plot has run, stacked, so you can tell a
 * structurally unprofitable plot from one that merely had a bad year.
 * --------------------------------------------------------------------- */

export type PlotHistory = {
  plot: Plot;
  areaSqm: number | null;
  cycles: CyclePnL[];
  totalCostCentavos: Centavos;
  totalRevenueCentavos: Centavos;
  totalMarginCentavos: Centavos;
  /** Margin per square metre across all closed cycles — the comparable number. */
  marginPerSqmCentavos: Centavos | null;
  closedCycleCount: number;
};

export function plotHistories(ledger: Ledger): PlotHistory[] {
  const all = allCyclePnL(ledger);
  return ledger.plots
    .map((plot) => {
      const cycles = all
        .filter((c) => c.cycle.plotId === plot.id)
        .sort((a, b) =>
          (b.cycle.dateStarted ?? "").localeCompare(a.cycle.dateStarted ?? ""),
        );
      const totalCost = cycles.reduce((a, c) => a + c.totalCostCentavos, 0);
      const totalRevenue = cycles.reduce((a, c) => a + c.revenueCentavos, 0);
      const areaSqm = cycles[0]?.areaSqm ?? null;
      const closed = cycles.filter((c) => c.isClosed);
      const closedMargin = closed.reduce((a, c) => a + c.grossMarginCentavos, 0);
      return {
        plot,
        areaSqm,
        cycles,
        totalCostCentavos: totalCost,
        totalRevenueCentavos: totalRevenue,
        totalMarginCentavos: totalRevenue - totalCost,
        marginPerSqmCentavos:
          areaSqm !== null && areaSqm > 0 && closed.length > 0
            ? Math.round(closedMargin / areaSqm)
            : null,
        closedCycleCount: closed.length,
      };
    })
    .sort((a, b) => a.plot.label.localeCompare(b.plot.label, undefined, { numeric: true }));
}

/** ------------------------------------------------------------------------
 * Period view — spend for any date range, cut by category, activity and plot.
 * --------------------------------------------------------------------- */

export type PeriodSpend = {
  from: ISODate;
  to: ISODate;
  totalCentavos: Centavos;
  capitalCentavos: Centavos;
  byCategory: { key: ExpenseCategory; amountCentavos: Centavos; share: number }[];
  byActivity: { key: string; label: string; amountCentavos: Centavos; share: number }[];
  byPlot: { key: string; label: string; amountCentavos: Centavos; share: number }[];
  farmWideCentavos: Centavos;
  revenueCentavos: Centavos;
};

export function periodSpend(ledger: Ledger, from: ISODate, to: ISODate): PeriodSpend {
  const inRange = (d: ISODate) => d >= from && d <= to;
  const activityLabel = new Map(ledger.activities.map((a) => [a.code, a.label]));
  const plotLabel = new Map(ledger.plots.map((p) => [p.id, p.label]));

  const byCategory = new Map<ExpenseCategory, Centavos>();
  const byActivity = new Map<string, Centavos>();
  let total = 0;
  let capital = 0;
  let farmWide = 0;

  for (const e of ledger.expenses) {
    if (!inRange(e.date)) continue;
    if (e.attribution === "capital") {
      capital += e.amountCentavos;
      continue; // capital is not operating spend
    }
    total += e.amountCentavos;
    if (e.attribution === "farm_wide") farmWide += e.amountCentavos;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCentavos);
    byActivity.set(e.activity, (byActivity.get(e.activity) ?? 0) + e.amountCentavos);
  }

  // Drawn stock is spend in the period it was consumed, not the period it was
  // bought. That is the whole point of tracking inventory separately.
  const purchaseById = new Map(ledger.purchases.map((p) => [p.id, p]));
  for (const draw of ledger.draws) {
    if (!inRange(draw.date)) continue;
    const purchase = purchaseById.get(draw.purchaseId);
    if (!purchase) continue;
    const cost = Math.round(purchase.unitCostCentavos * draw.quantity);
    total += cost;
    byCategory.set("Farm Inputs", (byCategory.get("Farm Inputs") ?? 0) + cost);
    byActivity.set(purchase.inputType, (byActivity.get(purchase.inputType) ?? 0) + cost);
  }

  const expenseById = new Map(ledger.expenses.map((e) => [e.id, e]));
  const byPlot = new Map<string, Centavos>();
  for (const alloc of ledger.allocations) {
    const e = expenseById.get(alloc.expenseId);
    if (!e || !inRange(e.date)) continue;
    byPlot.set(alloc.plotId, (byPlot.get(alloc.plotId) ?? 0) + alloc.amountCentavos);
  }

  const saleById = new Map(ledger.sales.map((s) => [s.id, s]));
  let revenue = 0;
  for (const line of ledger.saleLines) {
    const sale = saleById.get(line.saleId);
    if (sale && inRange(sale.date)) revenue += line.totalCentavos;
  }

  const share = (n: Centavos) => (total === 0 ? 0 : n / total);
  return {
    from,
    to,
    totalCentavos: total,
    capitalCentavos: capital,
    farmWideCentavos: farmWide,
    revenueCentavos: revenue,
    byCategory: [...byCategory.entries()]
      .map(([key, amountCentavos]) => ({ key, amountCentavos, share: share(amountCentavos) }))
      .sort((a, b) => b.amountCentavos - a.amountCentavos),
    byActivity: [...byActivity.entries()]
      .map(([key, amountCentavos]) => ({
        key,
        label: activityLabel.get(key) ?? key,
        amountCentavos,
        share: share(amountCentavos),
      }))
      .sort((a, b) => b.amountCentavos - a.amountCentavos),
    byPlot: [...byPlot.entries()]
      .map(([key, amountCentavos]) => ({
        key,
        label: plotLabel.get(key) ?? key,
        amountCentavos,
        share: share(amountCentavos),
      }))
      .sort((a, b) => b.amountCentavos - a.amountCentavos),
  };
}

/** ------------------------------------------------------------------------
 * Overhead watch — the farm-wide pool as a share of spend, month by month.
 * The owners want this kept under control, so a rising trend is flagged.
 * --------------------------------------------------------------------- */

export type OverheadPoint = {
  month: string; // yyyy-mm
  poolCentavos: Centavos;
  totalCentavos: Centavos;
  share: number;
};

export type OverheadWatch = {
  points: OverheadPoint[];
  overallShare: number;
  /** True when the last three months average above the three before them. */
  rising: boolean;
  latestShare: number | null;
};

export function overheadWatch(ledger: Ledger): OverheadWatch {
  const months = new Set<string>();
  for (const e of ledger.expenses) {
    if (e.attribution !== "capital") months.add(e.date.slice(0, 7));
  }

  const points = [...months].sort().map((month) => {
    const { poolCentavos, totalCentavos, share } = overheadShare(ledger, {
      from: `${month}-01`,
      to: `${month}-31`,
    });
    return { month, poolCentavos, totalCentavos, share };
  });

  const recent = points.slice(-3);
  const prior = points.slice(-6, -3);
  const mean = (xs: OverheadPoint[]) =>
    xs.length === 0 ? 0 : xs.reduce((a, p) => a + p.share, 0) / xs.length;

  return {
    points,
    overallShare: overheadShare(ledger).share,
    rising: prior.length > 0 && recent.length > 0 && mean(recent) > mean(prior),
    latestShare: points.at(-1)?.share ?? null,
  };
}

/** ------------------------------------------------------------------------
 * Buyer margin — revenue and the price actually realised, by buyer and grade.
 * Primera went for PHP 70, 65 and 60 inside eleven days at different markets,
 * so "the Primera price" is not a thing; only what each buyer actually paid is.
 * --------------------------------------------------------------------- */

export type BuyerProductRow = {
  product: string;
  quantity: number;
  revenueCentavos: Centavos;
  averagePriceCentavos: Centavos;
  minPriceCentavos: Centavos;
  maxPriceCentavos: Centavos;
};

export type BuyerMargin = {
  buyerId: string;
  buyerName: string;
  revenueCentavos: Centavos;
  quantity: number;
  saleCount: number;
  byProduct: BuyerProductRow[];
  lastSaleDate: ISODate | null;
};

export function buyerMargins(
  ledger: Ledger,
  opts: { from?: ISODate; to?: ISODate; includeBulk?: boolean } = {},
): BuyerMargin[] {
  const saleById = new Map(ledger.sales.map((s) => [s.id, s]));
  const buyerName = new Map(ledger.buyers.map((b) => [b.id, b.name]));

  type Acc = {
    revenue: Centavos;
    quantity: number;
    sales: Set<string>;
    last: ISODate | null;
    products: Map<string, { qty: number; revenue: Centavos; min: Centavos; max: Centavos }>;
  };
  const byBuyer = new Map<string, Acc>();

  for (const line of ledger.saleLines) {
    const sale = saleById.get(line.saleId);
    if (!sale) continue;
    if (opts.from !== undefined && sale.date < opts.from) continue;
    if (opts.to !== undefined && sale.date > opts.to) continue;
    // A lot dumped cheap is excluded by default so it does not drag the
    // realised-price averages down and hide what grade fruit actually fetches.
    if (line.isBulk && opts.includeBulk !== true) continue;

    const acc: Acc = byBuyer.get(sale.buyerId) ?? {
      revenue: 0, quantity: 0, sales: new Set(), last: null, products: new Map(),
    };
    acc.revenue += line.totalCentavos;
    acc.quantity += line.quantity;
    acc.sales.add(sale.id);
    if (acc.last === null || sale.date > acc.last) acc.last = sale.date;

    const p = acc.products.get(line.product) ?? {
      qty: 0, revenue: 0,
      min: line.unitPriceCentavos, max: line.unitPriceCentavos,
    };
    p.qty += line.quantity;
    p.revenue += line.totalCentavos;
    p.min = Math.min(p.min, line.unitPriceCentavos);
    p.max = Math.max(p.max, line.unitPriceCentavos);
    acc.products.set(line.product, p);
    byBuyer.set(sale.buyerId, acc);
  }

  const order = new Map(ledger.products.map((p) => [p.code, p.sortOrder]));
  return [...byBuyer.entries()]
    .map(([buyerId, acc]) => ({
      buyerId,
      buyerName: buyerName.get(buyerId) ?? buyerId,
      revenueCentavos: acc.revenue,
      quantity: Math.round(acc.quantity * 1000) / 1000,
      saleCount: acc.sales.size,
      lastSaleDate: acc.last,
      byProduct: [...acc.products.entries()]
        .map(([product, p]) => ({
          product,
          quantity: Math.round(p.qty * 1000) / 1000,
          revenueCentavos: p.revenue,
          averagePriceCentavos: Math.round(p.revenue / p.qty),
          minPriceCentavos: p.min,
          maxPriceCentavos: p.max,
        }))
        .sort((a, b) => (order.get(a.product) ?? 99) - (order.get(b.product) ?? 99)),
    }))
    .sort((a, b) => b.revenueCentavos - a.revenueCentavos);
}

/**
 * The last price a buyer paid for a product, used to pre-fill the sale form.
 * A default, never a rule: the field stays editable because the price moves
 * with the buyer and the day.
 */
export function lastPriceFor(
  ledger: Ledger,
  buyerId: string,
  product: string,
): { unitPriceCentavos: Centavos; date: ISODate } | null {
  const saleById = new Map(ledger.sales.map((s) => [s.id, s]));
  let best: { unitPriceCentavos: Centavos; date: ISODate } | null = null;
  for (const line of ledger.saleLines) {
    if (line.product !== product) continue;
    const sale = saleById.get(line.saleId);
    if (!sale || sale.buyerId !== buyerId) continue;
    if (best === null || sale.date > best.date) {
      best = { unitPriceCentavos: line.unitPriceCentavos, date: sale.date };
    }
  }
  return best;
}

/** ------------------------------------------------------------------------
 * Capital register — an asset list with straight-line depreciation.
 * Deliberately not a fixed-asset subledger.
 * --------------------------------------------------------------------- */

export type CapitalRow = {
  id: string;
  name: string;
  purchaseDate: ISODate;
  costCentavos: Centavos;
  usefulLifeMonths: number;
  monthlyChargeCentavos: Centavos;
  monthsElapsed: number;
  accumulatedCentavos: Centavos;
  bookValueCentavos: Centavos;
  fullyDepreciated: boolean;
  disposedOn: ISODate | null;
};

export function capitalRegister(ledger: Ledger, asOf?: ISODate): {
  rows: CapitalRow[];
  totalCostCentavos: Centavos;
  totalBookValueCentavos: Centavos;
  monthlyChargeCentavos: Centavos;
} {
  const on = asOf ?? new Date().toISOString().slice(0, 10);

  const rows = ledger.capitalAssets.map((asset) => {
    const monthly = Math.round(asset.costCentavos / asset.usefulLifeMonths);
    const end = asset.disposedOn !== null && asset.disposedOn < on ? asset.disposedOn : on;
    const months = Math.max(0, Math.min(asset.usefulLifeMonths, monthsBetween(asset.purchaseDate, end)));
    // The last month absorbs the rounding so an asset depreciates to exactly
    // zero rather than leaving a few stray centavos on the books forever.
    const accumulated =
      months >= asset.usefulLifeMonths ? asset.costCentavos : monthly * months;
    return {
      id: asset.id,
      name: asset.name,
      purchaseDate: asset.purchaseDate,
      costCentavos: asset.costCentavos,
      usefulLifeMonths: asset.usefulLifeMonths,
      monthlyChargeCentavos: monthly,
      monthsElapsed: months,
      accumulatedCentavos: accumulated,
      bookValueCentavos: asset.costCentavos - accumulated,
      fullyDepreciated: months >= asset.usefulLifeMonths,
      disposedOn: asset.disposedOn,
    };
  });

  return {
    rows: rows.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)),
    totalCostCentavos: rows.reduce((a, r) => a + r.costCentavos, 0),
    totalBookValueCentavos: rows.reduce((a, r) => a + r.bookValueCentavos, 0),
    monthlyChargeCentavos: rows
      .filter((r) => !r.fullyDepreciated && r.disposedOn === null)
      .reduce((a, r) => a + r.monthlyChargeCentavos, 0),
  };
}

/** Whole months from one date to another, counting only completed months. */
export function monthsBetween(from: ISODate, to: ISODate): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
}
