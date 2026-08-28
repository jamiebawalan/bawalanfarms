import { describe, expect, it } from "vitest";
import { parseExpenseSheet, parseDate, parseMoney, parsePlotList, type PlotRef } from "./parse";
import { matchActivity, matchCategory } from "./vocab";

const PLOTS: PlotRef[] = [
  { id: "p1", code: "1", label: "Plot 1", areaSqm: 7056 },
  { id: "p12", code: "12", label: "Plot 12", areaSqm: 3258 },
  { id: "p17", code: "17", label: "Plot 17", areaSqm: 4065 },
  { id: "p18", code: "18", label: "Plot 18", areaSqm: 2386 },
  { id: "p24", code: "24", label: "Plot 24", areaSqm: 3778 },
  { id: "p27", code: "27", label: "Coffee (27)", areaSqm: null },
];

const ACTIVITIES = [
  { code: "deweed", label: "Deweed" },
  { code: "abono", label: "Abono / Fertilizer Application" },
  { code: "food", label: "Food" },
  { code: "barang", label: "Barang (repairs, parts, diesel)" },
  { code: "other", label: "Other" },
];

const HEADER = ["Date", "Category", "Activity", "Plot", "Amount", "Rate", "Qty", "Notes"];
const OPTS = { sheetTag: "expenses-2024", today: "2026-08-26" };

function run(rows: string[][]) {
  return parseExpenseSheet([HEADER, ...rows], PLOTS, ACTIVITIES, OPTS);
}

describe("the four spellings of one activity", () => {
  it("folds every variant in the old data onto one code", () => {
    for (const spelling of [
      "Fertilizer Application",
      "Fertlizer Application 21-0-0",
      "Abono Apply",
      "Abono Application",
      "abono",
    ]) {
      const m = matchActivity(spelling, ACTIVITIES);
      expect(m, spelling).not.toBeNull();
      // The one naming a grade is about the fertiliser itself.
      expect(["abono", "fert_21_0_0"]).toContain(m!.code);
    }
  });

  it("folds the category spellings too", () => {
    expect(matchCategory("Farm inputs")).toBe("Farm Inputs");
    expect(matchCategory("Farm Inputs")).toBe("Farm Inputs");
    expect(matchCategory("Labor ")).toBe("Labor");
    expect(matchCategory("Miscelaneous")).toBe("Miscellaneous");
    expect(matchCategory("")).toBeNull();
  });

  it("keeps an unrecognised activity rather than dropping the row", () => {
    const r = run([["2024-03-01", "Labor", "Fixing the gate hinge", "12", "500"]]);
    expect(r.rejections).toEqual([]);
    expect(r.expenses[0]!.activity).toBe("other");
    expect(r.expenses[0]!.activityOtherNote).toBe("Fixing the gate hinge");
    expect(r.expenses[0]!.warnings.join()).toMatch(/not in the vocabulary/);
  });
});

describe("plot cells", () => {
  it("reads a single plot", () => {
    const r = run([["2024-03-01", "Labor", "Deweed", "12", "1800"]]);
    expect(r.expenses[0]!.attribution).toBe("direct");
    expect(r.expenses[0]!.allocations).toEqual([{ plotId: "p12", amountCentavos: 180_000 }]);
  });

  it("reads a list and splits it by area", () => {
    const r = run([["2024-03-01", "Labor", "Deweed", "17, 18", "1000"]]);
    const e = r.expenses[0]!;
    expect(e.attribution).toBe("split");
    // 4065 : 2386 sqm, and the lines must total the amount exactly.
    expect(e.allocations.reduce((a, l) => a + l.amountCentavos, 0)).toBe(100_000);
    expect(e.allocations[0]!.amountCentavos).toBeGreaterThan(e.allocations[1]!.amountCentavos);
  });

  it("names a plot cell that Excel turned into a date, instead of skipping it", () => {
    // This is the corruption itself: "24/2" stored as a date serial.
    const r = run([["2024-03-01", "Labor", "Deweed", "2024-02-24", "1000"]]);
    expect(r.expenses).toEqual([]);
    expect(r.rejections[0]!.reason).toMatch(/which is a date/);
    expect(r.rejections[0]!.reason).toMatch(/recovered by hand/);
  });

  it("rejects a plot that does not exist, naming it", () => {
    const r = run([["2024-03-01", "Labor", "Deweed", "12, 99", "1000"]]);
    expect(r.rejections[0]!.reason).toMatch(/No plot matches "99"/);
  });

  it("treats a blank plot as whole-farm and says what it assumed", () => {
    const r = run([["2024-03-01", "Machines", "Barang", "", "1000"]]);
    const e = r.expenses[0]!;
    expect(e.attribution).toBe("farm_wide");
    expect(e.farmWideReason).toBe("vehicle");
    expect(e.warnings.join()).toMatch(/no reason given/);
  });

  it("refuses a split where no plot has a surveyed area", () => {
    const r = run([["2024-03-01", "Labor", "Deweed", "27", "1000"]]);
    // A single unsurveyed plot is still a direct cost — only splits need areas.
    expect(r.expenses[0]!.attribution).toBe("direct");
  });

  it("warns when a split had to leave an unsurveyed plot out", () => {
    const r = run([["2024-03-01", "Labor", "Deweed", "17, 27", "1000"]]);
    const e = r.expenses[0]!;
    expect(e.allocations).toHaveLength(1);
    expect(e.allocations[0]!.amountCentavos).toBe(100_000);
    expect(e.warnings.join()).toMatch(/no surveyed area/);
  });

  it("accepts the separators people actually type", () => {
    const codes = (raw: string) =>
      parsePlotList(raw, new Map(PLOTS.map((p) => [p.code, p]))).plots.map((p) => p.code);
    expect(codes("17, 18")).toEqual(["17", "18"]);
    expect(codes("17 and 18")).toEqual(["17", "18"]);
    expect(codes("Plot 17; Plot 18")).toEqual(["17", "18"]);
    expect(codes("17 + 18")).toEqual(["17", "18"]);
    expect(codes("17,17")).toEqual(["17"]);
  });
});

describe("dates", () => {
  it("reads the formats the sheet actually holds", () => {
    expect(parseDate("2024-03-04")).toBe("2024-03-04");
    expect(parseDate("4/3/2024")).toBe("2024-03-04"); // day first
    expect(parseDate("4 Mar 2024")).toBe("2024-03-04");
    expect(parseDate("45355")).toBe("2024-03-04"); // Excel serial
  });

  it("refuses a date a year late instead of guessing", () => {
    const r = parseExpenseSheet(
      [HEADER, ["2027-03-01", "Labor", "Deweed", "12", "1000"]],
      PLOTS, ACTIVITIES, OPTS,
    );
    expect(r.expenses).toEqual([]);
    expect(r.rejections[0]!.reason).toMatch(/in the future/);
  });

  it("refuses a date before the farm's records", () => {
    const r = run([["2009-03-01", "Labor", "Deweed", "12", "1000"]]);
    expect(r.rejections[0]!.reason).toMatch(/before the farm's records/);
  });

  it("refuses an unreadable date rather than defaulting to today", () => {
    const r = run([["sometime in March", "Labor", "Deweed", "12", "1000"]]);
    expect(r.rejections[0]!.reason).toMatch(/Could not read the date/);
  });
});

describe("amounts", () => {
  it("reads pesos with symbols, commas and brackets", () => {
    expect(parseMoney("₱1,234.50")).toBe(123_450);
    expect(parseMoney("1800")).toBe(180_000);
    expect(parseMoney("(500)")).toBe(-50_000);
    expect(parseMoney("")).toBeNull();
  });

  it("keeps unit price and quantity when they agree with the amount", () => {
    const r = run([["2024-03-01", "Labor", "Deweed", "12", "1800", "450", "4"]]);
    expect(r.expenses[0]!.unitPriceCentavos).toBe(45_000);
    expect(r.expenses[0]!.quantity).toBe(4);
  });

  it("drops the working when it contradicts the amount, and says so", () => {
    // The database refuses a disagreement, and the amount column is the figure
    // the family reconciled against.
    const r = run([["2024-03-01", "Labor", "Deweed", "12", "1800", "450", "3"]]);
    expect(r.expenses[0]!.unitPriceCentavos).toBeNull();
    expect(r.expenses[0]!.warnings.join()).toMatch(/did not equal the amount/);
  });

  it("refuses a row with no readable amount", () => {
    const r = run([["2024-03-01", "Labor", "Deweed", "12", "TBC"]]);
    expect(r.rejections[0]!.reason).toMatch(/Could not read the amount/);
  });
});

describe("the shape of the result", () => {
  it("gives every row an import key so a corrected file replaces it", () => {
    const r = run([
      ["2024-03-01", "Labor", "Deweed", "12", "1000"],
      ["2024-03-02", "Labor", "Deweed", "12", "2000"],
    ]);
    expect(r.expenses.map((e) => e.importKey)).toEqual([
      "expenses-2024:2",
      "expenses-2024:3",
    ]);
  });

  it("accounts for every row, as an expense or as a rejection", () => {
    const rows = [
      ["2024-03-01", "Labor", "Deweed", "12", "1000"],
      ["2024-03-01", "Labor", "Deweed", "99", "1000"],
      ["nonsense", "Labor", "Deweed", "12", "1000"],
      ["2024-03-01", "Labor", "Deweed", "12", ""],
    ];
    const r = run(rows);
    expect(r.expenses.length + r.rejections.length).toBe(rows.length);
  });

  it("reports columns it read nothing from", () => {
    const r = parseExpenseSheet(
      [["Date", "Amount", "Mystery Column"], ["2024-03-01", "1000", "x"]],
      PLOTS, ACTIVITIES, OPTS,
    );
    expect(r.unusedColumns).toContain("Mystery Column");
  });

  it("refuses the whole file when a required column is missing", () => {
    const r = parseExpenseSheet(
      [["Category", "Activity"], ["Labor", "Deweed"]],
      PLOTS, ACTIVITIES, OPTS,
    );
    expect(r.expenses).toEqual([]);
    expect(r.rejections[0]!.reason).toMatch(/needs a date and a amount column/);
  });

  it("takes a blank category from the activity and flags it", () => {
    const r = run([["2024-03-01", "", "Food", "12", "500"]]);
    expect(r.expenses[0]!.category).toBe("Farm Inputs");
    expect(r.expenses[0]!.warnings.join()).toMatch(/blank/);
  });

  it("counts warnings so the summary can lead with the common ones", () => {
    const r = run([
      ["2024-03-01", "Machines", "Barang", "", "1000"],
      ["2024-03-02", "Machines", "Barang", "", "2000"],
    ]);
    const key = Object.keys(r.warningCounts).find((k) => /no reason given/.test(k))!;
    expect(r.warningCounts[key]).toBe(2);
  });
});

describe("dates written without a year", () => {
  it("refuses them instead of inventing one", () => {
    // The real workbook contains "Sept 29", "sept 29", "Sept 30" and
    // "Sep 15 - 20". JavaScript's Date.parse turns each into the year 2001,
    // which is a plausible-looking date and completely wrong. A cost filed
    // under a guessed year is worse than a row the owner has to look at.
    for (const written of ["Sept 29", "sept 29", "Sept 30", "Sep 15 - 20", "29 Sep"]) {
      expect(parseDate(written), written).toBeNull();
    }
  });

  it("still reads the same dates once a year is present", () => {
    expect(parseDate("29 Sep 2025")).toBe("2025-09-29");
    expect(parseDate("Sept 29 2025")).toBe("2025-09-29");
  });

  it("reports the row rather than dropping it", () => {
    const r = parseExpenseSheet(
      [["Date", "Category", "Expense", "Plot", "Amount"],
       ["Sept 29", "Labor", "Deweed", "12", "2100"]],
      PLOTS, ACTIVITIES, OPTS,
    );
    expect(r.expenses).toEqual([]);
    expect(r.rejections[0]!.reason).toMatch(/Could not read the date/);
  });
});
