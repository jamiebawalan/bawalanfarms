/**
 * @vitest-environment jsdom
 *
 * Correcting a cost, on the screen he entered it on.
 *
 * The thing that has to be true here is that the form opens on what is
 * actually in the books — the amount, the plots, the split he chose over the
 * areas — because a correction screen that quietly re-derives any of those
 * turns "fix the plot" into "re-enter everything and hope".
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExpenseForm, type ExistingExpense, type FormPlot } from "./expense-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

const PLOT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PLOT_B = "aaaaaaaa-0000-4000-8000-000000000002";

const plots: FormPlot[] = [
  { id: PLOT_A, code: "12", label: "Plot 12", areaSqm: 3000, openCycle: null },
  { id: PLOT_B, code: "24", label: "Plot 24", areaSqm: 9000, openCycle: null },
];

const activities = [
  { code: "deweed", label: "Deweed", activityGroup: "Field", defaultCategory: "Labor" as const },
  { code: "abono", label: "Fertilise", activityGroup: "Field", defaultCategory: "Farm Inputs" as const },
];

const existing: ExistingExpense = {
  id: "bbbbbbbb-0000-4000-8000-000000000001",
  date: "2026-08-12",
  category: "Labor",
  activity: "deweed",
  activityOtherNote: null,
  attribution: "split",
  farmWideReason: null,
  labourMode: "pakyaw",
  unitPriceCentavos: null,
  quantity: null,
  amountCentavos: 200000,
  paidTo: "Anthony",
  note: "half day",
  allocations: [
    { plotId: PLOT_A, amountCentavos: 150000 },
    { plotId: PLOT_B, amountCentavos: 50000 },
  ],
  capitalAsset: null,
  revisedAt: null,
};

const render = (over: Partial<ExistingExpense> = {}) =>
  renderToStaticMarkup(
    <ExpenseForm
      plots={plots}
      activities={activities as never}
      recentActivities={["deweed", "abono"]}
      existing={{ ...existing, ...over }}
    />,
  );

const renderNew = () =>
  renderToStaticMarkup(
    <ExpenseForm
      plots={plots}
      activities={activities as never}
      recentActivities={["deweed"]}
    />,
  );

describe("opening a saved cost to correct it", () => {
  it("says what it is correcting, so he knows he is not logging a second one", () => {
    const html = render();
    expect(html).toContain("Correcting");
    expect(html).toContain("₱2,000");
    expect(html).toContain("12 Aug 2026");
  });

  it("opens on the saved amount, not an empty box", () => {
    expect(render()).toContain('value="2000"');
  });

  it("opens on the saved date", () => {
    expect(render()).toContain('value="2026-08-12"');
  });

  it("keeps what he typed the first time", () => {
    const html = render();
    expect(html).toContain('value="Anthony"');
    expect(html).toContain('value="half day"');
  });

  /**
   * He overruled the areas once. Plot 24 is three times the size of Plot 12, so
   * the area split would say 25/75 — but he was standing there and put ₱1,500 of
   * the ₱2,000 on Plot 12. Reopening must show him 75/25, his answer.
   */
  it("shows the split that is in the books, not the one the areas suggest", () => {
    const html = render();
    expect(html).toContain('value="75"');
    expect(html).toContain('value="25"');
    expect(html).not.toContain("Split — suggested by area");
    expect(html).toContain("Split — your shares");
  });

  it("shows the stored pesos on each plot", () => {
    const html = render();
    expect(html).toContain("₱1,500");
    expect(html).toContain("₱500");
  });

  it("offers to save a correction, not to save a new cost", () => {
    expect(render()).toContain("Save correction");
  });

  it("says so when the entry has been corrected before", () => {
    expect(render({ revisedAt: "2026-08-13T02:00:00Z" }))
      .toContain("already been corrected once");
  });
});

describe("deleting an entry", () => {
  it("is offered, but folded away rather than sitting next to Save", () => {
    expect(render()).toContain("Delete this entry");
  });

  it("points him at correcting instead when the figure is merely wrong", () => {
    expect(render()).toContain("correct it above");
  });

  it("asks why, because 'logged twice' and 'wrong plot' are different facts", () => {
    expect(render()).toContain("Why are you deleting it?");
  });

  it("is not offered while logging a new cost — there is nothing to delete", () => {
    const html = renderNew();
    expect(html).not.toContain("Delete this entry");
    expect(html).not.toContain("Correcting");
    expect(html).toContain("Save");
  });
});

describe("a whole-farm cost, corrected", () => {
  it("opens on Whole farm with its reason still chosen", () => {
    const html = render({
      attribution: "farm_wide",
      farmWideReason: "vehicle",
      allocations: [],
    });
    expect(html).toContain("Whole farm");
    expect(html).toContain("diesel for the farm truck");
  });
});

describe("an equipment purchase, corrected", () => {
  it("opens on the asset it created, so its price can be fixed in one place", () => {
    const html = render({
      attribution: "capital",
      category: "Machines",
      allocations: [],
      capitalAsset: { name: "Knapsack sprayer", usefulLifeMonths: 60 },
    });
    expect(html).toContain('value="Knapsack sprayer"');
    expect(html).toContain('value="60"');
  });
});
