import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { CostReview, type ReviewItem } from "./cost-review";
import type { ActivityOption } from "@/lib/domain/activity-hints";

const ACTIVITIES: ActivityOption[] = [
  { code: "machine_repair", label: "Repairs and parts", activityGroup: "Machines" },
  { code: "side_dress", label: "Side-dress (granules)", activityGroup: "Nutrients" },
  { code: "peanut_seed", label: "Peanut seed (binhi)", activityGroup: "Peanut" },
  { code: "weed_spray", label: "Weed spray (chemical)", activityGroup: "Weeds" },
];

const item = (p: Partial<ReviewItem> & { key: string; text: string }): ReviewItem => ({
  kind: "note", entries: 1, pesos: 1000, sampleNote: null, sampleDate: null, ...p,
});

const render = (items: ReviewItem[]) =>
  renderToStaticMarkup(<CostReview items={items} activities={ACTIVITIES} />);

describe("clearing the costs filed under a word", () => {
  it("says so plainly when there is nothing left", () => {
    expect(render([])).toContain("Every cost is filed under an activity");
  });

  it("leads with the biggest, because that is what is worth answering", () => {
    const html = render([
      item({ key: "Mane Binhi", text: "Mane Binhi", pesos: 50000 }),
      item({ key: "Trash Pick up", text: "Trash Pick up", pesos: 400 }),
    ]);
    expect(html.indexOf("Mane Binhi")).toBeLessThan(html.indexOf("Trash Pick up"));
  });

  it("shows what a phrase cost and how many entries used it", () => {
    const html = render([
      item({ key: "Daddy", text: "Daddy", entries: 8, pesos: 25700 }),
    ]);
    expect(html).toContain("8 entries");
    expect(html).toContain("25,700");
  });

  it("suggests from the words themselves", () => {
    const html = render([item({ key: "wrangler parts", text: "wrangler parts" })]);
    expect(html).toContain("Repairs and parts");
  });

  it("explains an old code differently from a phrase", () => {
    const html = render([
      item({ kind: "code", key: "spray", text: "Spray", entries: 12,
             sampleNote: "sprayed the young ones" }),
    ]);
    expect(html).toContain("An old code");
    expect(html).toContain("sprayed the young ones");
  });

  it("offers a search for anything the suggestions miss", () => {
    const html = render([item({ key: "Daddy", text: "Daddy" })]);
    // 'Daddy' matches no activity, so the question is asked outright.
    expect(html).toContain("Which activity?");
  });

  it("promises that the original wording survives", () => {
    const html = render([item({ key: "x", text: "x" })]);
    expect(html).toContain("What was originally written is kept");
    expect(html).toContain("has to be split by hand");
  });

  it("totals what is still waiting", () => {
    const html = render([
      item({ key: "a", text: "a", pesos: 50000 }),
      item({ key: "b", text: "b", pesos: 25700 }),
    ]);
    expect(html).toContain("75,700");
  });
});
