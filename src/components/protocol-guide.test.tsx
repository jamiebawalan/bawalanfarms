import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProtocolGuide } from "./protocol-guide";
import type { Activity, ActivityMaterial, Material } from "@/lib/domain/protocol";

const act = (p: Partial<Activity> & { code: string; mapMonth: number }): Activity => ({
  category: "Nutrients", title: p.code, instruction: "Do it.", basis: "per_plant",
  series: null, choiceGroup: null, isDefault: false, condition: null, sortOrder: 100,
  ...p,
});

const catalogue = new Map<string, Material>([
  ["urea", { code: "urea", name: "Urea", kind: "fertiliser", analysis: "46-0-0",
             unit: "kg", note: null }],
  ["lime", { code: "lime", name: "Agricultural lime", kind: "amendment",
             analysis: null, unit: "kg", note: null }],
]);

const render = (a: Activity[], m: ActivityMaterial[] = []) =>
  renderToStaticMarkup(
    <ProtocolGuide activities={a} materials={m} catalogue={catalogue} />,
  );

describe("the crop read month by month", () => {
  it("says the protocol is missing rather than showing an empty crop", () => {
    expect(render([])).toContain("not loaded on this farm yet");
  });

  it("orders the months from land prep through harvest", () => {
    const html = render([
      act({ code: "harvest", mapMonth: 18, category: "Harvest" }),
      act({ code: "prep", mapMonth: -6, category: "Land prep" }),
      act({ code: "feed", mapMonth: 5 }),
    ]);
    expect(html.indexOf("Month -6")).toBeLessThan(html.indexOf("Month 5"));
    expect(html.indexOf("Month 5")).toBeLessThan(html.indexOf("Month 18"));
  });

  it("calls month zero what it actually is", () => {
    expect(render([act({ code: "plant", mapMonth: 0 })])).toContain("Planting");
  });

  it("gathers a month's work under one heading", () => {
    const html = render([
      act({ code: "a", mapMonth: 5, category: "Nutrients" }),
      act({ code: "b", mapMonth: 5, category: "Pests" }),
    ]);
    expect(html.match(/Month 5/g)).toHaveLength(1);
    expect(html).toContain("Nutrients · Pests");
  });

  it("gives the protocol's rate, not a plot's amount", () => {
    const html = render(
      [act({ code: "foliar_9", mapMonth: 9 })],
      [{ activityCode: "foliar_9", materialCode: "urea", qty: 2.52,
         qtyUnit: "g_per_plant", mixOrder: 6, note: null }],
    );
    // No plant count here, so no kilos — the rate itself.
    expect(html).toContain("2.52 g per plant");
    expect(html).toContain("Urea (46-0-0)");
    expect(html).not.toContain("kg");
  });

  it("keeps per-area rates per area", () => {
    const html = render(
      [act({ code: "amend", mapMonth: -4, basis: "per_area" })],
      [{ activityCode: "amend", materialCode: "lime", qty: 500,
         qtyUnit: "g_per_1000sqm", mixOrder: null, note: null }],
    );
    expect(html).toContain("500 g per 1,000 m²");
  });

  it("flags work that only happens under a condition", () => {
    const html = render([
      act({ code: "dap2", mapMonth: 4, condition: "Soil phosphorus below 12 ppm." }),
    ]);
    expect(html).toContain("Only when: Soil phosphorus below 12 ppm.");
  });

  it("starts folded, so eighteen months is not one long page", () => {
    const html = render([act({ code: "a", mapMonth: 5 })]);
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
  });
});
