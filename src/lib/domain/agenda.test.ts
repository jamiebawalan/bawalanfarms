import { describe, expect, it } from "vitest";
import {
  bucketAgenda, monthGrid, monthOf, shiftMonth, type AgendaItem,
} from "./agenda";

const item = (p: Partial<AgendaItem> & { id: string; dueOn: string }): AgendaItem => ({
  kind: "protocol",
  title: p.id,
  plotLabel: "Plot 11",
  blockName: null,
  isCritical: false,
  href: "/cycles/c1",
  ...p,
});

const TODAY = "2026-11-02"; // a Monday

describe("what is late, what is now, what is coming", () => {
  const items = [
    item({ id: "late", dueOn: "2026-10-28" }),
    item({ id: "now", dueOn: TODAY }),
    item({ id: "soon", dueOn: "2026-11-06" }),
    item({ id: "edge", dueOn: "2026-11-09" }), // exactly seven days out
    item({ id: "far", dueOn: "2026-11-20" }),
  ];

  it("splits them the way the day is actually read", () => {
    const b = bucketAgenda(items, TODAY);
    expect(b.overdue.map((i) => i.id)).toEqual(["late"]);
    expect(b.today.map((i) => i.id)).toEqual(["now"]);
    expect(b.thisWeek.map((i) => i.id)).toEqual(["soon", "edge"]);
    expect(b.later.map((i) => i.id)).toEqual(["far"]);
  });

  it("puts every item in exactly one bucket", () => {
    const b = bucketAgenda(items, TODAY);
    const all = [...b.overdue, ...b.today, ...b.thisWeek, ...b.later];
    expect(all).toHaveLength(items.length);
    expect(new Set(all.map((i) => i.id)).size).toBe(items.length);
  });

  it("ranks a critical job above an ordinary one on the same day", () => {
    const b = bucketAgenda(
      [
        item({ id: "ordinary", dueOn: TODAY }),
        item({ id: "urgent", dueOn: TODAY, isCritical: true }),
      ],
      TODAY,
    );
    expect(b.today.map((i) => i.id)).toEqual(["urgent", "ordinary"]);
  });

  it("does not let a critical job next week jump an ordinary one today", () => {
    const b = bucketAgenda(
      [
        item({ id: "next-week", dueOn: "2026-11-06", isCritical: true }),
        item({ id: "today", dueOn: TODAY }),
      ],
      TODAY,
    );
    expect(b.today.map((i) => i.id)).toEqual(["today"]);
    expect(b.thisWeek.map((i) => i.id)).toEqual(["next-week"]);
  });
});

describe("the month grid", () => {
  it("is rectangular, every row a full week starting Monday", () => {
    const g = monthGrid("2026-11-01", [], TODAY);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    // 1 Nov 2026 is a Sunday, so the grid opens on Monday 26 October.
    expect(g.weeks[0]![0]!.date).toBe("2026-10-26");
  });

  it("names the month the way a person would", () => {
    expect(monthGrid("2026-11-01", [], TODAY).label).toBe("November 2026");
  });

  it("keeps the work on the padding days rather than hiding it", () => {
    // 29 October belongs to the previous month but sits in this grid's first
    // row. Blanking it would hide three days of plan at every boundary.
    const g = monthGrid("2026-11-01", [item({ id: "x", dueOn: "2026-10-29" })], TODAY);
    const cell = g.weeks[0]!.find((d) => d.date === "2026-10-29")!;
    expect(cell.inMonth).toBe(false);
    expect(cell.items.map((i) => i.id)).toEqual(["x"]);
  });

  it("counts only what belongs to the month itself", () => {
    const g = monthGrid(
      "2026-11-01",
      [item({ id: "before", dueOn: "2026-10-29" }), item({ id: "in", dueOn: "2026-11-12" })],
      TODAY,
    );
    expect(g.count).toBe(1);
  });

  it("marks today, and the days already gone", () => {
    const g = monthGrid("2026-11-01", [], TODAY);
    const all = g.weeks.flat();
    expect(all.filter((d) => d.isToday).map((d) => d.date)).toEqual([TODAY]);
    expect(all.find((d) => d.date === "2026-11-01")!.isPast).toBe(true);
    expect(all.find((d) => d.date === "2026-11-03")!.isPast).toBe(false);
  });

  it("puts every day of the month somewhere", () => {
    for (const month of ["2026-02-01", "2026-11-01", "2027-01-01", "2028-02-01"]) {
      const g = monthGrid(month, [], TODAY);
      const inMonth = g.weeks.flat().filter((d) => d.inMonth).map((d) => d.date);
      const expected = new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
      ).getUTCDate();
      expect(inMonth).toHaveLength(expected);
      expect(inMonth[0]).toBe(month);
    }
  });

  it("does not trail an entirely empty week", () => {
    const g = monthGrid("2026-11-01", [], TODAY);
    const last = g.weeks[g.weeks.length - 1]!;
    expect(last.some((d) => d.inMonth)).toBe(true);
  });

  it("orders a day's items the way the buckets do", () => {
    const g = monthGrid(
      "2026-11-01",
      [
        item({ id: "b", dueOn: "2026-11-12" }),
        item({ id: "a", dueOn: "2026-11-12", isCritical: true }),
      ],
      TODAY,
    );
    const cell = g.weeks.flat().find((d) => d.date === "2026-11-12")!;
    expect(cell.items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("moving between months", () => {
  it("steps forward and back, and over a year end", () => {
    expect(shiftMonth("2026-11-01", 1)).toBe("2026-12-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2027-01-01", -1)).toBe("2026-12-01");
    expect(shiftMonth("2026-11-01", -11)).toBe("2025-12-01");
  });

  it("finds the month a date sits in", () => {
    expect(monthOf("2026-11-23")).toBe("2026-11-01");
  });
});
