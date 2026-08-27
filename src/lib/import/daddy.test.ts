import { describe, expect, it } from "vitest";
import { parseExpenseSheet, type PlotRef } from "./parse";

const PLOTS: PlotRef[] = [{ id: "p1", code: "1", label: "Plot 1", areaSqm: 7056 }];
const ACTIVITIES = [{ code: "other", label: "Other" }];

/**
 * The owner's ruling: work paid to his father is farm overhead, not a plot
 * cost — there is no rent arrangement behind it to attribute.
 */
describe("the Daddy rows", () => {
  it("import as whole-farm overhead with the wording preserved", () => {
    const r = parseExpenseSheet(
      [
        ["Date", "Category", "Expense", "Plots charged", "Amount"],
        ["2025-06-14", "Labor", "Daddy", "", "3000"],
        ["2026-05-09", "Labor", "Palabor ni Daddy", "", "2000"],
      ],
      PLOTS, ACTIVITIES, { sheetTag: "t", today: "2026-08-27" },
    );

    expect(r.rejections).toEqual([]);
    expect(r.expenses).toHaveLength(2);
    for (const e of r.expenses) {
      expect(e.attribution).toBe("farm_wide");
      expect(e.farmWideReason).toBe("general");
      expect(e.allocations).toEqual([]);
    }
    // Not in the vocabulary, so the original wording is kept rather than lost.
    expect(r.expenses.map((e) => e.activityOtherNote))
      .toEqual(["Daddy", "Palabor ni Daddy"]);
  });

  it("still reaches every cycle, because overhead is shared out by area", () => {
    // Overhead is not a dead end: allocateFarmWide spreads it across the
    // cycles that were live on the day it was paid.
    const r = parseExpenseSheet(
      [["Date", "Category", "Expense", "Plots charged", "Amount"],
       ["2025-06-14", "Labor", "Daddy", "", "3000"]],
      PLOTS, ACTIVITIES, { sheetTag: "t", today: "2026-08-27" },
    );
    expect(r.expenses[0]!.amountCentavos).toBe(300_000);
  });
});
