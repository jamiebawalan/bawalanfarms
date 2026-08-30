import { describe, expect, it } from "vitest";
import { makeLedger } from "./fixture";
import { cycleIsLiveOn, plotIsOccupiedOn } from "./allocation";
import {
  landUse, ownerDashboard, plotCostRanking, projectForcing, projectHarvest,
  tasksForWeek, windows,
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
    // Only p1 (6000) is carrying a crop. p2's peanut cycle is closed, so the
    // plot is free whatever its close date says, and p3 (2000) was never
    // planted. Mango is excluded — it takes no share of anything.
    expect(u.totalSqm).toBe(10_000);
    expect(u.plantedSqm).toBe(6_000);
    expect(u.utilisation).toBeCloseTo(0.6);
  });

  it("names the idle plots, largest first, because that is the opportunity", () => {
    expect(u.idlePlots.map((p) => p.label)).toEqual(["Plot 2", "Plot 3"]);
  });

  it("measures plants standing against what the land could hold", () => {
    expect(u.plantsStanding).toBe(11_500);
    expect(u.plantsPotential).toBe(Math.round(10_000 * DEFAULT_SETTINGS.targetPlantsPerSqm));
    expect(u.plantUtilisation).toBeCloseTo(11_500 / 25_000, 4);
  });

  it("shows where utilisation lands once the planned cycle goes in", () => {
    const withPlan: Ledger = {
      ...L,
      cycles: [
        ...L.cycles,
        {
          id: "cp", plotId: "p3", crop: "pineapple", status: "planned",
          dateStarted: null, datePlanted: null, dateClosed: null,
          kasamaSharePct: null, targetForcingDate: null, targetHarvestDate: null,
        },
      ],
    };
    const next = landUse(withPlan, TODAY);
    expect(next.nextPlanned?.label).toBe("Plot 3");
    // p3 goes in, so 8,000 of 10,000. p2 stays empty until something is
    // planned for it — which is exactly the gap this figure exists to show.
    expect(next.utilisationAfterNext).toBeCloseTo(0.8);
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

describe("projecting when to force", () => {
  // Anthony measures ten plants at random every few weeks. Two readings give a
  // growth rate; the rate says when the plants reach forcing size.
  const measured = (readings: [string, number][]): Ledger => ({
    ...L,
    leafMeasurements: readings.map(([date, avgLengthCm]) => ({
      id: `lm-c1-${date}`, cycleId: "c1", date, avgLengthCm, sampleSize: 20,
    })),
  });

  it("uses the growth rate between readings", () => {
    // 60cm to 80cm over 40 days is 0.5cm a day; 20cm short of 100 is 40 days more.
    const l = measured([["2024-04-01", 60], ["2024-05-11", 80]]);
    const f = projectForcing(l, "c1")!;
    expect(f.date).toBe("2024-06-20");
    expect(f.cmPerDay).toBe(0.5);
    expect(f.fromReadings).toBe(2);
  });

  it("says ready now when the plants are already big enough", () => {
    const l = measured([["2024-04-01", 95], ["2024-05-01", 105]]);
    expect(projectForcing(l, "c1")!.date).toBe("2024-05-01");
  });

  it("refuses to project from a single reading", () => {
    // One measurement says how big the plants are, not how fast they grow.
    // A confident date off one reading is a guess wearing a number.
    expect(projectForcing(measured([["2024-04-01", 60]]), "c1")).toBeNull();
    expect(projectForcing(L, "c1")).toBeNull();
  });

  it("refuses when the plants have not grown between readings", () => {
    expect(projectForcing(measured([["2024-04-01", 80], ["2024-05-01", 80]]), "c1")).toBeNull();
  });

  it("reports slippage against the forcing date the farm planned", () => {
    const l = measured([["2024-04-01", 60], ["2024-05-11", 80]]);
    const planned: Ledger = {
      ...l,
      cycles: l.cycles.map((c) =>
        c.id === "c1" ? { ...c, targetForcingDate: "2024-06-01" } : c,
      ),
    };
    // Projected 20 June against a target of 1 June: nineteen days late.
    expect(plotCostRanking(planned, TODAY)[0]!.forcingSlipDays).toBe(19);
  });
});

describe("projecting the harvest", () => {
  it("follows the forcing date by the farm's forcing-to-harvest interval", () => {
    const l: Ledger = {
      ...L,
      leafMeasurements: [
        { id: "lm-c1-2024-04-01", cycleId: "c1", date: "2024-04-01", avgLengthCm: 60, sampleSize: 10 },
        { id: "lm-c1-2024-05-11", cycleId: "c1", date: "2024-05-11", avgLengthCm: 80, sampleSize: 10 },
      ],
    };
    // Forcing 20 June, plus five months.
    expect(projectHarvest(l, "c1", TODAY)).toBe("2024-11-20");
  });

  it("falls back to planting plus the usual cycle length with no readings", () => {
    // c1 was planted 2024-02-01; eighteen months later is 2025-08-01.
    expect(projectHarvest(L, "c1", TODAY)).toBe("2025-08-01");
  });

  it("returns nothing when there is neither a reading nor a planting date", () => {
    const bare: Ledger = {
      ...L,
      cycles: L.cycles.map((c) => (c.id === "c1" ? { ...c, datePlanted: null } : c)),
    };
    expect(projectHarvest(bare, "c1", TODAY)).toBeNull();
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

describe("closing a cycle today", () => {
  // What the manager actually does: he finishes a plot, closes the cycle on his
  // phone, and looks at Land in use to decide what to plant next. If the plot
  // does not move to idle until tomorrow, the screen is lying about the farm as
  // it is right now — and he closed it precisely to see that.
  const closedToday: Ledger = {
    ...L,
    cycles: L.cycles.map((c) =>
      c.id === "c1" ? { ...c, status: "closed" as const, dateClosed: TODAY } : c,
    ),
  };

  it("frees the plot immediately, not tomorrow", () => {
    const before = landUse(L, TODAY);
    const after = landUse(closedToday, TODAY);
    expect(after.plantedSqm).toBeLessThan(before.plantedSqm);
    expect(after.idlePlots.map((p) => p.label)).toContain("Plot 1");
  });

  it("stops counting its plants as standing", () => {
    expect(landUse(closedToday, TODAY).plantsStanding)
      .toBeLessThan(landUse(L, TODAY).plantsStanding);
  });

  it("drops it out of the cost-per-plant ranking of live plots", () => {
    const ranked = plotCostRanking(closedToday, TODAY);
    expect(ranked.map((r) => r.plotLabel)).not.toContain("Plot 1");
  });

  it("still treats it as having been live earlier in the cycle", () => {
    // The historical question is a different one: money spent on this plot in
    // May belongs to the cycle that was running in May, closed or not.
    const cycle = closedToday.cycles.find((c) => c.id === "c1")!;
    expect(cycleIsLiveOn(cycle, "2024-05-01")).toBe(true);
  });
});

describe("replanting a plot the same day it was closed", () => {
  // The worse half of the same bug. The new-cycle form asks whether the plot is
  // already busy, and quietly files the cycle as *planned* with no start date
  // if it is. So a manager who closed a cycle in the morning and started the
  // next one after lunch got a planned cycle he never asked for — and the plot
  // stayed exactly as it looked before he touched anything.
  const closedToday: Ledger = {
    ...L,
    cycles: L.cycles.map((c) =>
      c.id === "c1" ? { ...c, status: "closed" as const, dateClosed: TODAY } : c,
    ),
  };

  it("does not consider the plot busy any more", () => {
    const stillBusy = closedToday.cycles.find(
      (c) => c.plotId === "p1" && plotIsOccupiedOn(c, TODAY),
    );
    expect(stillBusy).toBeUndefined();
  });

  it("counts the replacement cycle as planted straight away", () => {
    const replanted: Ledger = {
      ...closedToday,
      cycles: [
        ...closedToday.cycles,
        {
          id: "c1b", plotId: "p1", crop: "pineapple", status: "land_prep" as const,
          dateStarted: TODAY, datePlanted: null, dateClosed: null,
          kasamaSharePct: null, targetForcingDate: null, targetHarvestDate: null,
        },
      ],
    };
    const u = landUse(replanted, TODAY);
    expect(u.plantedSqm).toBe(6_000);
    expect(u.idlePlots.map((p) => p.label)).not.toContain("Plot 1");
  });
});
