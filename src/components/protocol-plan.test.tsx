import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The component refreshes the page after an answer. Rendering it needs the
// hook to exist; nothing here taps anything, so a no-op router is enough.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { ProtocolPlan, type PlanAnswered, type PlanSuggestion } from "./protocol-plan";

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
    expect(html).toContain("not how long they have been in the ground");
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

  it("offers the three answers the farm actually has", () => {
    const html = render({ suggestions: [suggestion({ code: "x" })] });
    expect(html).toContain("Did it");
    expect(html).toContain("Not this one");
  });

  it("offers nothing to tap on a closed cycle", () => {
    const html = render({ suggestions: [suggestion({ code: "x" })], closed: true });
    expect(html).not.toContain("Did it");
    expect(html).not.toContain("Not this one");
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
        skipReason: "superseded", doneOn: null },
    ];
    const html = render({ answered });
    expect(html).toContain("1 already answered");
    expect(html).not.toContain("Undo");
  });
});
