/**
 * Age, and who a plot may fairly be compared with.
 *
 * The owner's rule: nineteen months against eighteen, never against ten,
 * because a plot nineteen months in has already paid for everything the
 * ten-month plot has not yet reached. Ranking cost per plant across that gap
 * says nothing worth acting on.
 */
import { describe, expect, it } from "vitest";
import {
  AGE_BANDS, bandFor, byAgeOldestFirst, cycleAgeMonths, groupByBand, isSetAside,
  monthsBetween,
} from "./age";
import type { Cycle } from "./types";

const TODAY = "2026-08-30";

const cycle = (id: string, dateStarted: string | null, crop = "pineapple"): Cycle => ({
  id, plotId: `p-${id}`, crop, status: "growing",
  dateStarted, datePlanted: null, dateClosed: null,
  kasamaSharePct: null, targetForcingDate: null, targetHarvestDate: null,
});

describe("counting months", () => {
  it("counts whole months, the unit the farm speaks in", () => {
    expect(monthsBetween("2025-01-30", TODAY)).toBe(19);
    expect(monthsBetween("2026-08-30", TODAY)).toBe(0);
  });

  it("does not round a part-month up", () => {
    // 31 Jan to 30 Aug is a day short of seven months, so it is six.
    expect(monthsBetween("2026-01-31", TODAY)).toBe(6);
    expect(monthsBetween("2026-01-30", TODAY)).toBe(7);
  });

  it("counts from the cycle start, which is when the spending began", () => {
    expect(cycleAgeMonths(cycle("a", "2025-01-30"), TODAY)).toBe(19);
  });

  it("falls back to the planting date when land prep was never dated", () => {
    const c = { ...cycle("a", null), datePlanted: "2025-08-30" };
    expect(cycleAgeMonths(c, TODAY)).toBe(12);
  });

  it("has no age at all when nothing has started", () => {
    expect(cycleAgeMonths(cycle("a", null), TODAY)).toBeNull();
  });

  it("has no age when the start is still in the future", () => {
    expect(cycleAgeMonths(cycle("a", "2026-12-01"), TODAY)).toBeNull();
  });
});

describe("the bands", () => {
  it("covers every month with exactly one band, leaving no gap or overlap", () => {
    for (let m = 0; m <= 40; m++) {
      const hits = AGE_BANDS.filter((b) => m >= b.from && (b.to === null || m < b.to));
      expect(hits).toHaveLength(1);
    }
  });

  it("puts the owner's stages where she described them", () => {
    expect(bandFor(0)!.key).toBe("establishing");
    expect(bandFor(6)!.key).toBe("establishing");
    expect(bandFor(7)!.key).toBe("vegetative");
    expect(bandFor(12)!.key).toBe("vegetative");
    expect(bandFor(13)!.key).toBe("approaching");
    expect(bandFor(18)!.key).toBe("approaching");
    expect(bandFor(19)!.key).toBe("overdue");
    expect(bandFor(30)!.key).toBe("overdue");
  });

  it("gives no band to a plot with no age", () => {
    expect(bandFor(null)).toBeNull();
  });
});

describe("ordering", () => {
  const rows = [
    { cycle: cycle("young", "2026-06-30") },      // 2 months
    { cycle: cycle("oldest", "2025-01-30") },     // 19 months
    { cycle: cycle("banana", "2020-01-01", "banana") },
    { cycle: cycle("middle", "2025-08-30") },     // 12 months
    { cycle: cycle("unstarted", null) },
  ];

  it("puts the oldest plot at the top", () => {
    const order = byAgeOldestFirst(rows, (r) => r, TODAY).map((r) => r.cycle.id);
    expect(order[0]).toBe("oldest");
    expect(order.slice(0, 3)).toEqual(["oldest", "middle", "young"]);
  });

  it("sinks banana below everything, however old it is", () => {
    // Planted in 2020 and by far the oldest, but there is little to decide
    // about it, so it must not take the top of a screen meant for decisions.
    const order = byAgeOldestFirst(rows, (r) => r, TODAY).map((r) => r.cycle.id);
    expect(order[order.length - 1]).toBe("banana");
    expect(isSetAside("Banana")).toBe(true);
    expect(isSetAside("pineapple")).toBe(false);
  });

  it("sorts an undated plot last among the ordinary ones, not first", () => {
    // An unknown age is not a great age.
    const order = byAgeOldestFirst(rows, (r) => r, TODAY).map((r) => r.cycle.id);
    expect(order.indexOf("unstarted")).toBe(order.length - 2);
  });
});

describe("grouping into comparable bands", () => {
  const rows = [
    { cycle: cycle("a", "2025-01-30") },   // 19 — overdue
    { cycle: cycle("b", "2025-02-28") },   // 18 — approaching
    { cycle: cycle("c", "2025-10-30") },   // 10 — vegetative
    { cycle: cycle("d", "2026-06-30") },   // 2  — establishing
    { cycle: cycle("banana", "2020-01-01", "banana") },
    { cycle: cycle("undated", null) },
  ];
  const groups = groupByBand(rows, (r) => r, TODAY);

  it("leads with the oldest band", () => {
    expect(groups[0]!.band?.key).toBe("overdue");
    expect(groups[0]!.items.map((r) => r.cycle.id)).toEqual(["a"]);
  });

  it("keeps the nineteen-month plot away from the ten-month one", () => {
    const bandOf = (id: string) =>
      groups.find((g) => g.items.some((r) => r.cycle.id === id))!.band?.key;
    expect(bandOf("a")).not.toBe(bandOf("c"));
    expect(bandOf("a")).not.toBe(bandOf("b"));
  });

  it("gathers banana and the undated plot at the end, under no band", () => {
    const last = groups[groups.length - 1]!;
    expect(last.band).toBeNull();
    expect(last.items.map((r) => r.cycle.id).sort()).toEqual(["banana", "undated"]);
  });

  it("drops empty bands rather than showing an empty heading", () => {
    const one = groupByBand([rows[0]!], (r) => r, TODAY);
    expect(one).toHaveLength(1);
    expect(one[0]!.band?.key).toBe("overdue");
  });

  it("loses nobody", () => {
    expect(groups.flatMap((g) => g.items)).toHaveLength(rows.length);
  });
});
