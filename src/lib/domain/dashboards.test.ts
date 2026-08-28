import { describe, expect, it } from "vitest";
import { makeLedger } from "./fixture";
import {
  landUse, ownerDashboard, plotCostRanking, projectHarvest, tasksForWeek, windows,
} from "./dashboards";
import { DEFAULT_SETTINGS, type Ledger } from "./types";

const TODAY = "2024-06-01";
const L = makeLedger();

describe("the two windows", () => {
  it("compares a year against a quarter, because one number on an 18-month crop is noise", () => {
    const w = windows("2024-06-01");
    expect(w.year.from).toBe("2023-06-02");
    expect(w.quarter.from).toBe("2024-03-02");
    expect(w.year.to).toBe("2024-06-01");
  });
});

describe("owner dashboard", () => {
  const d = ownerDashboard(L, TODAY);

  it("counts revenue and fruit sold in the window", () => {
    // The fixture sells 600 Primera and 250 Segunda in May 2024 for ₱50,000.
    expect(d.year.revenueCentavos).toBe(5_000_000);
    expect(d.year.fruitSold).toBe(850);
  });

  it("gives the average price actually realised per fruit", () => {
    expect(d.year.avgRevenuePerFruitCentavos).toBe(Math.round(5_000_000 / 850));
  });

  it("shows the grade mix behind that average, best grade first", () => {
    // "₱58 a fruit" means something different at 71% Primera than at 71% Kwarta.
    expect(d.year.gradeMix.map((g) => g.product)).toEqual(["primera", "segunda"]);
    expect(d.year.gradeMix[0]!.share).toBeCloseTo(600 / 850, 3);
  });

  it("reports fruit picked against the plants standing at the time", () => {
    // 1,000 fruit harvested. The count used is February's 12,000, not August's
    // 11,500 — a recount taken after the window closed cannot retroactively
    // change what was standing during it.
    expect(d.year.fruitHarvested).toBe(1000);
    expect(d.year.harvestRate).toBeCloseTo(1000 / 12_000, 4);
  });

  it("gives cost per fruit sold, and ranks what drove the cost", () => {
    expect(d.year.avgCostPerFruitSoldCentavos).toBe(
      Math.round(d.year.costCentavos / 850),
    );
    expect(d.year.costDrivers[0]!.amountCentavos).toBeGreaterThan(0);
    const shares = d.year.costDrivers.reduce((a, r) => a + r.share, 0);
    expect(shares).toBeLessThanOrEqual(1.0001);
  });

  it("says nothing rather than zero when nothing has been sold", () => {
    // A blank tile means "not measured". A zero would mean "measured, and it is
    // nothing" — the two must not look the same on a screen you steer by.
    const quiet: Ledger = { ...L, sales: [], saleLines: [] };
    const q = ownerDashboard(quiet, TODAY).year;
    expect(q.avgRevenuePerFruitCentavos).toBeNull();
    expect(q.avgCostPerFruitSoldCentavos).toBeNull();
    expect(q.revenueCentavos).toBe(0);
  });

  it("narrows correctly to the quarter", () => {
    // Everything in the fixture happened inside the quarter too.
    expect(ownerDashboard(L, "2025-06-01").quarter.revenueCentavos).toBe(0);
  });
});

describe("land use", () => {
  const u = landUse(L, TODAY);

  it("measures planted area against the area that could be planted", () => {
    // p1 (6000) and p2 (2000) are live; p3 (2000) is empty. Mango is excluded.
    expect(u.totalSqm).toBe(10_000);
    expect(u.plantedSqm).toBe(8_000);
    expect(u.utilisation).toBeCloseTo(0.8);
  });

  it("names the idle plots, largest first, because that is the opportunity", () => {
    expect(u.idlePlots.map((p) => p.label)).toEqual(["Plot 3"]);
  });

  it("measures plants standing against what the land could hold", () => {
    expect(u.plantsStanding).toBe(11_500);
    expect(u.plantsPotential).toBe(Math.round(10_000 * DEFAULT_SETTINGS.maxPlantsPerSqm));
    expect(u.plantUtilisation).toBeCloseTo(11_500 / 33_000, 4);
  });

  it("shows where utilisation lands once the planned cycle goes in", () => {
    const withPlan: Ledger = {
      ...L,
      cycles: [
        ...L.cycles,
        {
          id: "cp", plotId: "p3", crop: "pineapple", status: "planned",
          dateStarted: null, datePlanted: null, dateClosed: null,
          kasamaSharePct: null, targetHarvestDate: null,
        },
      ],
    };
    const next = landUse(withPlan, TODAY);
    expect(next.nextPlanned?.label).toBe("Plot 3");
    expect(next.utilisationAfterNext).toBeCloseTo(1.0);
  });
});

describe("plot cost ranking", () => {
  it("lists pineapple cycles worst cost per plant first", () => {
    const rows = plotCostRanking(L, TODAY);
    expect(rows.map((r) => r.plotLabel)).toEqual(["Plot 1"]);
    expect(rows[0]!.costPerPlantCentavos).toBeGreaterThan(0);
  });

  it("splits the cost into the drivers a manager can act on", () => {
    const row = plotCostRanking(L, TODAY)[0]!;
    expect(row.labourCentavos + row.inputsCentavos + row.otherCentavos)
      .toBe(row.totalCostCentavos);
    expect(row.inputsCentavos).toBe(1_100_000); // the drawn fertiliser
  });

  it("leaves out peanut and closed cycles", () => {
    const rows = plotCostRanking(L, TODAY);
    expect(rows.every((r) => r.crop === "pineapple")).toBe(true);
    expect(rows.some((r) => r.plotLabel === "Plot 2")).toBe(false);
  });
});

describe("projecting a harvest", () => {
  it("uses the D-leaf growth rate once there are two readings", () => {
    // 60cm to 80cm in 40 days is 0.5cm a day; 20cm short of 100 is 40 more days.
    const measured: Ledger = {
      ...L,
      leafMeasurements: [
        { cycleId: "c1", date: "2024-04-01", avgLengthCm: 60, sampleSize: 20 },
        { cycleId: "c1", date: "2024-05-11", avgLengthCm: 80, sampleSize: 20 },
      ],
    };
    expect(projectHarvest(measured, "c1", TODAY)).toBe("2024-06-20");
  });

  it("says now when the plants have already reached the ready length", () => {
    const ready: Ledger = {
      ...L,
      leafMeasurements: [
        { cycleId: "c1", date: "2024-04-01", avgLengthCm: 95, sampleSize: 20 },
        { cycleId: "c1", date: "2024-05-01", avgLengthCm: 105, sampleSize: 20 },
      ],
    };
    expect(projectHarvest(ready, "c1", TODAY)).toBe("2024-05-01");
  });

  it("falls back to planting date plus the usual cycle length", () => {
    // c1 was planted 2024-02-01; 18 months later is 2025-08-01.
    expect(projectHarvest(L, "c1", TODAY)).toBe("2025-08-01");
  });

  it("returns nothing when there is neither a reading nor a planting date", () => {
    const bare: Ledger = {
      ...L,
      cycles: L.cycles.map((c) => (c.id === "c1" ? { ...c, datePlanted: null } : c)),
    };
    expect(projectHarvest(bare, "c1", TODAY)).toBeNull();
  });

  it("reports slippage against the date that was planned", () => {
    const planned: Ledger = {
      ...L,
      cycles: L.cycles.map((c) =>
        c.id === "c1" ? { ...c, targetHarvestDate: "2025-06-01" } : c,
      ),
    };
    // Projected 2025-08-01 against a target of 2025-06-01 is 61 days late.
    expect(plotCostRanking(planned, TODAY)[0]!.slipDays).toBe(61);
  });
});

describe("tasks for the week", () => {
  const withTasks: Ledger = {
    ...L,
    tasks: [
      { id: "t1", plotId: "p1", cycleId: null, title: "Spray plot 1", activity: null,
        dueDate: "2024-05-20", isCritical: false, doneAt: null },
      { id: "t2", plotId: "p2", cycleId: null, title: "Force plot 2", activity: null,
        dueDate: "2024-06-03", isCritical: true, doneAt: null },
      { id: "t3", plotId: null, cycleId: null, title: "Buy fertiliser", activity: null,
        dueDate: "2024-06-05", isCritical: false, doneAt: null },
      { id: "t4", plotId: "p1", cycleId: null, title: "Later job", activity: null,
        dueDate: "2024-08-01", isCritical: false, doneAt: null },
      { id: "t5", plotId: "p1", cycleId: null, title: "Already done", activity: null,
        dueDate: "2024-05-01", isCritical: true, doneAt: "2024-05-02T00:00:00Z" },
    ],
  };

  it("separates overdue from this week from later", () => {
    const t = tasksForWeek(withTasks, TODAY);
    expect(t.overdue.map((x) => x.id)).toEqual(["t1"]);
    expect(t.thisWeek.map((x) => x.id)).toEqual(["t2", "t3"]);
    expect(t.later.map((x) => x.id)).toEqual(["t4"]);
  });

  it("puts the critical ones first", () => {
    expect(tasksForWeek(withTasks, TODAY).thisWeek[0]!.isCritical).toBe(true);
  });

  it("leaves finished work out entirely", () => {
    const all = tasksForWeek(withTasks, TODAY);
    const ids = [...all.overdue, ...all.thisWeek, ...all.later].map((t) => t.id);
    expect(ids).not.toContain("t5");
  });

  it("names the plot so the manager knows where to go", () => {
    expect(tasksForWeek(withTasks, TODAY).overdue[0]!.plotLabel).toBe("Plot 1");
  });
});
