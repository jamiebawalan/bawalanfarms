import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The component refreshes the page after an answer. Rendering it needs the
// hook to exist; nothing here taps anything, so a no-op router is enough.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import {
  DrawConfirm, ProtocolPlan, type DrawLineView, type PlanAnswered, type PlanSuggestion,
  type TankPlanView,
} from "./protocol-plan";

const suggestion = (p: Partial<PlanSuggestion> & { code: string }): PlanSuggestion => ({
  title: p.code,
  instruction: "Do the thing.",
  category: "Nutrients",
  mapMonth: 5,
  timing: "due now",
  tone: "due",
  condition: null,
  options: [],
  doses: [],
  missing: null,
  tank: null,
  ...p,
});

const render = (props: Partial<Parameters<typeof ProtocolPlan>[0]> = {}) =>
  renderToStaticMarkup(
    <ProtocolPlan
      cycleId="c1"
      subPlotId={null}
      blockName={null}
      mapMonth={5}
      suggestions={[]}
      answered={[]}
      closed={false}
      loaded
      {...props}
    />,
  );

describe("what the protocol says, on screen", () => {
  it("says the protocol is not loaded rather than that nothing is due", () => {
    const html = render({ loaded: false });
    expect(html).toContain("not loaded on this farm yet");
    expect(html).not.toContain("Nothing due");
  });

  it("asks for the stage before it will guess at one", () => {
    const html = render({ mapMonth: null });
    expect(html).toContain("growth stage");
    expect(html).toContain("not how long since planting");
    // And nothing is suggested until it has one.
    expect(html).not.toContain("Plan to do it");
  });

  it("shows the protocol's month and how the block sits against it", () => {
    const html = render({
      suggestions: [suggestion({ code: "foliar_5", title: "Foliar feed", mapMonth: 5 })],
    });
    expect(html).toContain("month 5");
    expect(html).toContain("due now");
  });

  it("shows two and offers the rest behind one tap", () => {
    const html = render({
      suggestions: ["a", "b", "c", "d", "e"].map((c) => suggestion({ code: c, title: c })),
    });
    expect(html).toContain("Show 3 more things");
    // The three extra are not rendered until asked for.
    expect(html).not.toContain(">c<");
  });

  it("asks him to plan it, not to claim he has done it", () => {
    const html = render({ suggestions: [suggestion({ code: "x" })] });
    expect(html).toContain("Plan to do it");
    expect(html).toContain("Not this one");
    // Nothing is marked done straight off a suggestion: it has not happened yet.
    expect(html).not.toContain(">Did it<");
  });

  it("offers nothing to tap on a closed cycle", () => {
    const html = render({ suggestions: [suggestion({ code: "x" })], closed: true });
    expect(html).not.toContain("Plan to do it");
    expect(html).not.toContain("Not this one");
  });

  it("keeps planned work open, with its date, above the settled history", () => {
    const html = render({
      answered: [
        { code: "foliar_5", title: "Foliar feed", mapMonth: 5, state: "scheduled",
          skipReason: null, dueOn: "2099-01-20", doneOn: null, proposal: []  },
        { code: "mortality_check", title: "Mortality check", mapMonth: 0.5,
          state: "skipped", skipReason: "already_done", dueOn: null, doneOn: null, proposal: []  },
      ],
    });
    expect(html).toContain("Planned");
    expect(html).toContain("Foliar feed");
    // The planned one can be closed out; the settled one is folded away.
    expect(html).toContain("Did it");
    expect(html).toContain("1 already answered");
    expect(html).not.toContain("Mortality check");
  });

  it("marks a plan overdue once its date has passed", () => {
    const html = render({
      answered: [
        { code: "foliar_5", title: "Foliar feed", mapMonth: 5, state: "scheduled",
          skipReason: null, dueOn: "2020-01-20", doneOn: null, proposal: []  },
      ],
    });
    expect(html).toContain("overdue");
  });

  it("shows a choice as one row, not two jobs", () => {
    const html = render({
      suggestions: [
        suggestion({
          code: "side_dress_2",
          title: "DAP and potash",
          options: [
            { code: "side_dress_2", title: "DAP and potash", condition: "pH above 5.0" },
            { code: "side_dress_2_alt", title: "Ammonium sulfate", condition: null },
          ],
        }),
      ],
    });
    expect(html).toContain("One of these, not both");
    expect(html).toContain("Ammonium sulfate");
    expect(html).not.toContain("Show 1 more");
  });

  it("says it needs a plant count instead of printing a made-up weight", () => {
    const html = render({
      suggestions: [suggestion({ code: "foliar_5", missing: "plants" })],
    });
    expect(html).toContain("Needs a plant count");
  });

  it("lists what to mix when it can work it out", () => {
    const html = render({
      suggestions: [
        suggestion({
          code: "foliar_9",
          doses: [
            { name: "Urea (46-0-0)", display: "6.68 kg", note: null },
            { name: "Zinc sulfate", display: "31.8 g", note: null },
          ],
        }),
      ],
    });
    expect(html).toContain("6.68 kg");
    expect(html).toContain("31.8 g");
  });

  it("names a block when the plot is blocked out", () => {
    expect(render({ blockName: "Block A" })).toContain("Block A");
  });

  it("will not offer to undo a round that was merely overtaken", () => {
    const answered: PlanAnswered[] = [
      { code: "foliar_4", title: "Foliar feed", mapMonth: 4, state: "skipped",
        skipReason: "superseded", dueOn: null, doneOn: null, proposal: []  },
    ];
    const html = render({ answered });
    expect(html).toContain("1 already answered");
    expect(html).not.toContain("Undo");
  });
});

describe("the mixing instructions", () => {
  const tank = (over: Partial<TankPlanView> = {}): TankPlanView => ({
    tankLitres: 16, waterLitres: 200, mlPerPlant: 75, plantsPerTank: 212,
    fullTanks: 12, lastTankPlants: 106, warning: null,
    lines: [
      { name: "Zinc sulfate", display: "2.5 g",
        premix: { totalDisplay: "31.8 g", dissolveInMl: 1300, perTankMl: 100 } },
      { name: "Urea (46-0-0)", display: "534 g", premix: null },
    ],
    ...over,
  });

  it("leads with how many tanks, which is what he needs to carry", () => {
    const html = render({ suggestions: [suggestion({ code: "f", tank: tank() })] });
    expect(html).toContain("How to mix it — 13 tanks of 16 L");
  });

  it("says how many plants one tank covers, because that is the trap", () => {
    const html = render({ suggestions: [suggestion({ code: "f", tank: tank() })] });
    expect(html).toContain("212 plants");
    expect(html).toContain("run out as you finish them");
  });

  it("shows a premixed product as a volume, not a weight nobody can measure", () => {
    const html = render({ suggestions: [suggestion({ code: "f", tank: tank() })] });
    expect(html).toContain("100 ml of premix");
    expect(html).toContain("31.8 g in 1.3 L of water");
    // The weighable one keeps its weight.
    expect(html).toContain("534 g");
  });

  it("warns about the part tank rather than letting him overdose it", () => {
    const html = render({ suggestions: [suggestion({ code: "f", tank: tank() })] });
    expect(html).toContain("last tank covers 106 plants");
    expect(html).toContain("50%");
  });

  it("says nothing about a part tank when the plot divides evenly", () => {
    const html = render({
      suggestions: [suggestion({ code: "f", tank: tank({ lastTankPlants: 0 }) })],
    });
    expect(html).not.toContain("last tank covers");
  });

  it("surfaces a mix that falls outside the protocol", () => {
    const html = render({
      suggestions: [
        suggestion({ code: "f", tank: tank({ warning: "Only 22 ml of mix per plant" }) }),
      ],
    });
    expect(html).toContain("Only 22 ml of mix per plant");
  });
});

describe("setting the growth stage", () => {
  it("offers the control in the very place it asks for it", () => {
    const html = render({ mapMonth: null });
    expect(html).toContain("What month is this plot at?");
    expect(html).toContain("Set the stage");
    // And explains the thing that trips people up.
    expect(html).toContain("not how long since planting");
    expect(html).toContain("-4 is four months before planting");
  });

  it("calls it a block when the plot is blocked out", () => {
    const html = render({ mapMonth: null, blockName: "Block A" });
    expect(html).toContain("What month is this block at?");
  });

  it("lets the stage be changed later from the month itself", () => {
    const html = render({ mapMonth: 5 });
    expect(html).toContain("Month 5");
    // The month is a button, not a label, so it can be corrected.
    expect(html).toContain("<button");
  });
});

describe("taking stock for completed work", () => {
  const planned = (proposal: DrawLineView[]): PlanAnswered[] => [
    { code: "foliar_9", title: "Foliar feed, round 6", mapMonth: 9,
      state: "scheduled", skipReason: null, dueOn: "2026-11-14", doneOn: null,
      proposal },
  ];

  const urea: DrawLineView = {
    materialName: "Urea (46-0-0)", wanted: "6.68 kg", unit: "sack",
    draws: [{ purchaseId: "p1", quantity: 0.134, lotDate: "2026-01-20" }],
    shortfall: 0, untracked: false,
  };

  it("does not deduct anything on the way to the confirmation", () => {
    // The planned row shows "Did it" and nothing else: no stock language
    // until he has actually been shown what would move.
    const html = render({ answered: planned([urea]) });
    expect(html).toContain("Did it");
    expect(html).not.toContain("Take this out of stock?");
  });

  it("shows no stock step at all for work that consumes nothing", () => {
    const html = render({ answered: planned([]) });
    expect(html).toContain("Did it");
    expect(html).not.toContain("Take this out of stock?");
  });
});

describe("the stock confirmation itself", () => {
  const show = (lines: DrawLineView[], takeStock = true) =>
    renderToStaticMarkup(
      <DrawConfirm
        lines={lines} amounts={{}} setAmounts={() => {}}
        takeStock={takeStock} setTakeStock={() => {}} busy={false}
        onCancel={() => {}} onConfirm={() => {}}
      />,
    );

  const urea: DrawLineView = {
    materialName: "Urea (46-0-0)", wanted: "6.68 kg", unit: "sack",
    draws: [{ purchaseId: "p1", quantity: 0.134, lotDate: "2026-01-20" }],
    shortfall: 0, untracked: false,
  };

  it("asks rather than tells", () => {
    const html = show([urea]);
    expect(html).toContain("Take this out of stock?");
    expect(html).toContain("Change anything that is not what actually came out");
  });

  it("shows the amount as an editable figure, not a fixed one", () => {
    const html = show([urea]);
    expect(html).toContain('value="0.134"');
    expect(html).toContain("sack from 20 Jan");
  });

  it("can be waved off without losing the completion", () => {
    expect(show([urea], false)).toContain("Done, leave stock alone");
    expect(show([urea], true)).toContain("Done, take the stock");
  });

  it("names a shortfall and says the work is still recorded", () => {
    const html = show([{ ...urea, shortfall: 0.5 }]);
    expect(html).toContain("Not enough in stock for Urea (46-0-0)");
    expect(html).toContain("a purchase was never entered");
    expect(html).toContain("The work still gets recorded");
  });

  it("says plainly when something is not tracked, rather than showing zero", () => {
    const html = show([
      { materialName: "KOH", wanted: "330 g", unit: null, draws: [],
        shortfall: 0, untracked: true },
    ]);
    expect(html).toContain("Not tracked in stock");
    expect(html).not.toContain("Not enough in stock");
  });

  it("splits a line across lots and dates each one", () => {
    const html = show([{
      ...urea, wanted: "150 kg",
      draws: [
        { purchaseId: "a", quantity: 2, lotDate: "2026-01-20" },
        { purchaseId: "b", quantity: 1, lotDate: "2026-06-05" },
      ],
    }]);
    expect(html).toContain("sack from 20 Jan");
    expect(html).toContain("sack from 05 Jun");
  });
});
