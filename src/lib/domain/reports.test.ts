import { describe, expect, it } from "vitest";
import { makeLedger } from "./fixture";
import {
  buyerMargins, capitalRegister, lastPriceFor, monthsBetween,
  overheadWatch, periodSpend, plotHistories,
} from "./reports";
import type { Ledger } from "./types";

const L = makeLedger();

describe("plot history", () => {
  it("stacks every cycle a plot has run", () => {
    const p1 = plotHistories(L).find((h) => h.plot.code === "1")!;
    expect(p1.cycles.map((c) => c.cycle.id)).toEqual(["c1"]);
    expect(p1.totalRevenueCentavos).toBe(5_000_000);
  });

  it("gives margin per square metre only once a cycle has closed", () => {
    const histories = plotHistories(L);
    // Plot 1's cycle is still harvesting: its margin is not yet a verdict.
    expect(histories.find((h) => h.plot.code === "1")!.marginPerSqmCentavos).toBeNull();
    // Plot 2's peanut cycle closed, so it is comparable.
    const p2 = histories.find((h) => h.plot.code === "2")!;
    expect(p2.closedCycleCount).toBe(1);
    expect(p2.marginPerSqmCentavos).toBe(Math.round(-470_000 / 2000));
  });

  it("includes plots that have never run a cycle", () => {
    const p3 = plotHistories(L).find((h) => h.plot.code === "3")!;
    expect(p3.cycles).toEqual([]);
    expect(p3.totalMarginCentavos).toBe(0);
  });
});

describe("period view", () => {
  it("totals operating spend in the window and leaves capital out of it", () => {
    const r = periodSpend(L, "2024-03-01", "2024-03-31");
    // ₱1,800 + ₱400 + ₱1,000 of expenses, plus ₱15,400 of fertiliser drawn.
    expect(r.totalCentavos).toBe(320_000 + 1_540_000);
    expect(r.capitalCentavos).toBe(600_000);
  });

  it("counts drawn stock in the month it was consumed, not bought", () => {
    // The lot was bought on 1 February and drawn on 10 March.
    const feb = periodSpend(L, "2024-02-01", "2024-02-29");
    expect(feb.totalCentavos).toBe(0);
    const mar = periodSpend(L, "2024-03-01", "2024-03-31");
    const inputs = mar.byCategory.find((c) => c.key === "Farm Inputs")!;
    expect(inputs.amountCentavos).toBe(1_540_000);
  });

  it("cuts spend by activity with the family's own labels", () => {
    const r = periodSpend(L, "2024-03-01", "2024-03-31");
    const deweed = r.byActivity.find((a) => a.key === "deweed")!;
    expect(deweed.label).toBe("Deweed");
    expect(deweed.amountCentavos).toBe(180_000);
  });

  it("cuts spend by plot", () => {
    const r = periodSpend(L, "2024-03-01", "2024-03-31");
    expect(r.byPlot.find((p) => p.key === "p1")!.amountCentavos).toBe(210_000);
    expect(r.byPlot.find((p) => p.key === "p2")!.amountCentavos).toBe(10_000);
  });

  it("reports revenue in the window alongside spend", () => {
    const may = periodSpend(L, "2024-05-01", "2024-05-31");
    expect(may.revenueCentavos).toBe(5_000_000);
  });

  it("returns zeroes for an empty window without dividing by zero", () => {
    const r = periodSpend(L, "2020-01-01", "2020-12-31");
    expect(r.totalCentavos).toBe(0);
    expect(r.byCategory).toEqual([]);
  });
});

describe("overhead watch", () => {
  it("reports the pool as a share of spend, month by month", () => {
    const w = overheadWatch(L);
    const march = w.points.find((p) => p.month === "2024-03")!;
    expect(march.poolCentavos).toBe(100_000);
    expect(march.share).toBeCloseTo(100_000 / 320_000);
  });

  it("flags a rising trend so the owners see it early", () => {
    const rising: Ledger = {
      ...L,
      expenses: [
        ...month("2024-01", 10_000, 100_000),
        ...month("2024-02", 10_000, 100_000),
        ...month("2024-03", 10_000, 100_000),
        ...month("2024-04", 40_000, 100_000),
        ...month("2024-05", 45_000, 100_000),
        ...month("2024-06", 50_000, 100_000),
      ],
    };
    expect(overheadWatch(rising).rising).toBe(true);

    const steady: Ledger = {
      ...L,
      expenses: [
        ...month("2024-01", 10_000, 100_000),
        ...month("2024-02", 10_000, 100_000),
        ...month("2024-03", 10_000, 100_000),
        ...month("2024-04", 10_000, 100_000),
        ...month("2024-05", 10_000, 100_000),
        ...month("2024-06", 10_000, 100_000),
      ],
    };
    expect(overheadWatch(steady).rising).toBe(false);
  });
});

function month(m: string, overhead: number, direct: number): Ledger["expenses"] {
  return [
    {
      id: `${m}-fw`, date: `${m}-05`, category: "Machines", activity: "barang",
      attribution: "farm_wide", farmWideReason: "vehicle", capitalAssetId: null,
      labourMode: null, unitPriceCentavos: null, quantity: null,
      amountCentavos: overhead,
    },
    {
      id: `${m}-d`, date: `${m}-06`, category: "Labor", activity: "deweed",
      attribution: "direct", farmWideReason: null, capitalAssetId: null,
      labourMode: "daily", unitPriceCentavos: null, quantity: null,
      amountCentavos: direct,
    },
  ];
}

describe("buyer margin", () => {
  it("reports revenue and the price range each buyer actually paid", () => {
    const rows = buyerMargins(L);
    const maynilaan = rows.find((r) => r.buyerName === "Maynilaan")!;
    // Two sales: 300 Primera at ₱70 and 100 at ₱60, plus 250 Segunda at ₱40.
    expect(maynilaan.saleCount).toBe(2);
    const primera = maynilaan.byProduct.find((p) => p.product === "primera")!;
    expect(primera.quantity).toBe(400);
    expect(primera.minPriceCentavos).toBe(6_000);
    expect(primera.maxPriceCentavos).toBe(7_000);
    expect(primera.averagePriceCentavos).toBe(6_750);
  });

  it("ranks buyers by revenue so the owners can see who is worth the trip", () => {
    const rows = buyerMargins(L);
    expect(rows[0]!.buyerName).toBe("Maynilaan");
    expect(rows[0]!.revenueCentavos).toBe(3_700_000);
    expect(rows[1]!.buyerName).toBe("Batas");
  });

  it("leaves a cheap bulk dump out of realised-price averages by default", () => {
    const withBulk: Ledger = {
      ...L,
      saleLines: [
        ...L.saleLines,
        {
          saleId: "s1", product: "quinta", quantity: 600,
          unitPriceCentavos: 500, totalCentavos: 300_000, isBulk: true,
        },
      ],
    };
    const excluded = buyerMargins(withBulk).find((r) => r.buyerName === "Maynilaan")!;
    expect(excluded.byProduct.some((p) => p.product === "quinta")).toBe(false);

    const included = buyerMargins(withBulk, { includeBulk: true })
      .find((r) => r.buyerName === "Maynilaan")!;
    expect(included.byProduct.some((p) => p.product === "quinta")).toBe(true);
  });

  it("narrows to a date range", () => {
    const rows = buyerMargins(L, { from: "2024-05-08", to: "2024-05-08" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.buyerName).toBe("Batas");
  });
});

describe("last price", () => {
  it("offers the most recent price that buyer paid for that grade", () => {
    // Maynilaan paid ₱70 on 2 May and ₱60 on 13 May: the form should offer ₱60.
    expect(lastPriceFor(L, "b1", "primera")).toEqual({
      unitPriceCentavos: 6_000,
      date: "2024-05-13",
    });
  });

  it("offers nothing for a buyer and grade never traded before", () => {
    expect(lastPriceFor(L, "b2", "segunda")).toBeNull();
  });
});

describe("capital register", () => {
  it("charges straight-line depreciation from the purchase date", () => {
    // ₱6,000 sprayer over 60 months = ₱100 a month.
    const r = capitalRegister(L, "2024-09-04");
    const sprayer = r.rows[0]!;
    expect(sprayer.monthlyChargeCentavos).toBe(10_000);
    expect(sprayer.monthsElapsed).toBe(6);
    expect(sprayer.accumulatedCentavos).toBe(60_000);
    expect(sprayer.bookValueCentavos).toBe(540_000);
  });

  it("depreciates to exactly zero, leaving no stray centavos", () => {
    const odd: Ledger = {
      ...L,
      capitalAssets: [{
        id: "a2", name: "Chainsaw", purchaseDate: "2020-01-01",
        costCentavos: 1_000_01, usefulLifeMonths: 7, disposedOn: null,
      }],
    };
    const r = capitalRegister(odd, "2024-01-01");
    expect(r.rows[0]!.bookValueCentavos).toBe(0);
    expect(r.rows[0]!.fullyDepreciated).toBe(true);
  });

  it("stops depreciating a disposed asset", () => {
    const disposed: Ledger = {
      ...L,
      capitalAssets: [{
        ...L.capitalAssets[0]!, disposedOn: "2024-06-04",
      }],
    };
    const r = capitalRegister(disposed, "2025-01-01");
    expect(r.rows[0]!.monthsElapsed).toBe(3);
    expect(r.monthlyChargeCentavos).toBe(0); // no longer a running charge
  });

  it("does not depreciate before the purchase date", () => {
    const r = capitalRegister(L, "2024-01-01");
    expect(r.rows[0]!.monthsElapsed).toBe(0);
    expect(r.rows[0]!.bookValueCentavos).toBe(600_000);
  });
});

describe("monthsBetween", () => {
  it("counts only completed months", () => {
    expect(monthsBetween("2024-03-04", "2024-04-03")).toBe(0);
    expect(monthsBetween("2024-03-04", "2024-04-04")).toBe(1);
    expect(monthsBetween("2024-03-04", "2025-03-04")).toBe(12);
    expect(monthsBetween("2024-03-04", "2024-03-04")).toBe(0);
  });
});
