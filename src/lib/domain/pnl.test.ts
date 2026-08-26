import { describe, expect, it } from "vitest";
import { makeLedger } from "./fixture";
import { allCyclePnL, cyclePnL, unattachedCosts } from "./pnl";
import { allocateFarmWide, cycleIsLiveOn, overheadShare } from "./allocation";
import type { Ledger } from "./types";

const L = makeLedger();
const c1 = () => cyclePnL(L, "c1")!;
const c2 = () => cyclePnL(L, "c2")!;

describe("cycle costs", () => {
  it("counts direct and split allocations tagged to the cycle", () => {
    // ₱1,800 deweeding + ₱300 of the ₱400 food split (6000:2000 sqm).
    expect(c1().directCostCentavos).toBe(210_000);
    expect(c2().directCostCentavos).toBe(10_000);
  });

  it("charges drawn stock, not purchased stock", () => {
    // 250 sacks were bought for ₱275,000 but only 14 have been drawn. The
    // failure this replaces: the whole lot landing on nobody.
    expect(c1().inputDrawCostCentavos).toBe(1_100_000); // 10 sacks
    expect(c2().inputDrawCostCentavos).toBe(440_000); //  4 sacks
    const drawnTotal = c1().inputDrawCostCentavos + c2().inputDrawCostCentavos;
    expect(drawnTotal).toBeLessThan(L.purchases[0]!.totalCentavos);
  });

  it("keeps capital out of the cycle entirely", () => {
    // The ₱6,000 sprayer appears in no cycle's costs.
    const total = allCyclePnL(L).reduce((a, c) => a + c.totalCostCentavos, 0);
    const sprayer = L.expenses.find((e) => e.id === "e4")!.amountCentavos;
    expect(total).toBeGreaterThan(0);
    for (const c of allCyclePnL(L)) {
      expect(c.costByCategory.some((r) => r.amountCentavos === sprayer)).toBe(false);
    }
  });

  it("adds the cycle's area share of the farm-wide pool", () => {
    // ₱1,000 truck repair. Live that day: c1 (6000 sqm) and c2 (2000 sqm).
    // The Mango cycle is live too, but the owner excluded Mango from overhead.
    expect(c1().farmWideShareCentavos).toBe(75_000);
    expect(c2().farmWideShareCentavos).toBe(25_000);
  });

  it("totals cost as direct plus draws plus overhead", () => {
    const c = c1();
    expect(c.totalCostCentavos).toBe(
      c.directCostCentavos + c.inputDrawCostCentavos + c.farmWideShareCentavos,
    );
    expect(c.totalCostCentavos).toBe(1_385_000);
  });

  it("breaks cost down by category and by activity", () => {
    const c = c1();
    const labor = c.costByCategory.find((r) => r.category === "Labor")!;
    expect(labor.amountCentavos).toBe(210_000);
    const inputs = c.costByCategory.find((r) => r.category === "Farm Inputs")!;
    expect(inputs.amountCentavos).toBe(1_100_000); // the drawn fertiliser
    expect(c.costByActivity[0]!.activity).toBe("fert_21_0_0");
  });
});

describe("cycle revenue and margin", () => {
  it("sums revenue from every sale line on the cycle", () => {
    // ₱21,000 + ₱13,000 + ₱6,000 Primera, plus ₱10,000 Segunda.
    expect(c1().revenueCentavos).toBe(5_000_000);
  });

  it("reports the price actually realised, not a list price", () => {
    // Primera sold at ₱70, ₱65 and ₱60 across eleven days: 600 fruit,
    // ₱40,000, so ₱66.67 realised.
    const primera = c1().revenueByProduct.find((p) => p.product === "primera")!;
    expect(primera.quantity).toBe(600);
    expect(primera.revenueCentavos).toBe(4_000_000);
    expect(primera.averagePriceCentavos).toBe(6_667);
  });

  it("computes gross margin and the margin ratio", () => {
    const c = c1();
    expect(c.grossMarginCentavos).toBe(5_000_000 - 1_385_000);
    expect(c.marginRatio).toBeCloseTo(0.723, 3);
  });

  it("leaves the margin ratio undefined before anything is sold", () => {
    expect(c2().revenueCentavos).toBe(0);
    expect(c2().marginRatio).toBeNull();
  });
});

describe("per-plant and per-fruit figures", () => {
  it("uses the plant count, and says which count it used", () => {
    const c = c1();
    expect(c.plantCount).toBe(11_500); // the latest observation
    expect(c.plantCountDate).toBe("2024-08-01");
    expect(c.costPerPlantCentavos).toBe(Math.round(1_385_000 / 11_500));
  });

  it("uses the count as it stood at an as-of date", () => {
    const c = cyclePnL(L, "c1", "2024-03-31")!;
    expect(c.plantCount).toBe(12_000); // February's count, not August's
  });

  it("surfaces the gap between fruit picked and fruit sold", () => {
    const c = c1();
    expect(c.quantityHarvested).toBe(1000); // 500 + 300 + 200
    expect(c.quantitySold).toBe(850); // 300 + 200 + 100 + 250
    expect(c.quantityUnsold).toBe(150); // spoilage or giveaway, shown not hidden
  });

  it("gives cost per fruit harvested and margin per fruit sold", () => {
    const c = c1();
    expect(c.costPerUnitHarvestedCentavos).toBe(Math.round(1_385_000 / 1000));
    expect(c.marginPerUnitSoldCentavos).toBe(Math.round(3_615_000 / 850));
  });
});

describe("as-of dating", () => {
  it("ignores costs and sales after the as-of date", () => {
    const c = cyclePnL(L, "c1", "2024-03-05")!;
    expect(c.revenueCentavos).toBe(0); // sales start in May
    expect(c.inputDrawCostCentavos).toBe(0); // the draw is 10 March
    expect(c.directCostCentavos).toBe(210_000);
  });
});

describe("farm-wide allocation", () => {
  it("skips plots the owner excluded from overhead", () => {
    const r = allocateFarmWide(L);
    expect(r.byCycle.get("cm")).toBeUndefined(); // Mango
    expect(r.poolCentavos).toBe(100_000);
    expect(r.unallocatedCentavos).toBe(0);
  });

  it("allocates the pool in full, to the centavo", () => {
    const r = allocateFarmWide(L);
    const allocated = [...r.byCycle.values()].reduce((a, b) => a + b, 0);
    expect(allocated + r.unallocatedCentavos).toBe(r.poolCentavos);
  });

  it("reports pool money that landed on no cycle rather than dropping it", () => {
    // A repair paid before anything was planted belongs to no cycle.
    const early: Ledger = {
      ...L,
      expenses: [
        {
          id: "x", date: "2023-01-01", category: "Machines", activity: "barang",
          attribution: "farm_wide", farmWideReason: "vehicle", capitalAssetId: null,
          labourMode: null, unitPriceCentavos: null, quantity: null,
          amountCentavos: 50_000,
        },
      ],
    };
    const r = allocateFarmWide(early);
    expect(r.unallocatedCentavos).toBe(50_000);
    expect(r.byCycle.size).toBe(0);
  });

  it("does not charge a cycle for money spent before it started", () => {
    const late: Ledger = {
      ...L,
      expenses: [
        {
          id: "x", date: "2024-12-01", category: "Machines", activity: "barang",
          attribution: "farm_wide", farmWideReason: "vehicle", capitalAssetId: null,
          labourMode: null, unitPriceCentavos: null, quantity: null,
          amountCentavos: 50_000,
        },
      ],
    };
    // c2 closed on 30 June, so December's repair is not its problem.
    expect(allocateFarmWide(late).byCycle.get("c2")).toBeUndefined();
    expect(allocateFarmWide(late).byCycle.get("c1")).toBe(50_000);
  });

  it("treats a planned cycle as not yet spending", () => {
    const planned = { ...L.cycles[0]!, status: "planned" as const };
    expect(cycleIsLiveOn(planned, "2024-03-03")).toBe(false);
    expect(cycleIsLiveOn(L.cycles[0]!, "2024-03-03")).toBe(true);
    expect(cycleIsLiveOn(L.cycles[1]!, "2024-12-01")).toBe(false); // closed in June
  });

  it("measures overhead as a share of operating spend, excluding capital", () => {
    const r = overheadShare(L);
    // ₱1,000 pool over ₱4,000 of non-capital expense entries.
    expect(r.poolCentavos).toBe(100_000);
    expect(r.totalCentavos).toBe(400_000);
    expect(r.share).toBeCloseTo(0.25);
  });
});

describe("unattached costs", () => {
  it("surfaces money spent on a plot with no cycle open", () => {
    // This is the report that stops the app repeating the spreadsheet's
    // central failure: the money is not lost, but it reaches no P&L.
    const rows = unattachedCosts(L);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.plotLabel).toBe("Plot 3");
    expect(rows[0]!.amountCentavos).toBe(80_000);
  });
});

describe("kasama plots", () => {
  it("carries the tenant's share of the crop as a cost line", () => {
    const withKasama: Ledger = {
      ...L,
      cycles: L.cycles.map((c) => (c.id === "c1" ? { ...c, kasamaSharePct: 25 } : c)),
    };
    const c = cyclePnL(withKasama, "c1")!;
    // Revenue is still what the plot produced; the arrangement shows as cost.
    expect(c.revenueCentavos).toBe(5_000_000);
    expect(c.kasamaShareCentavos).toBe(1_250_000);
    expect(c.totalCostCentavos).toBe(1_385_000 + 1_250_000);
  });
});
