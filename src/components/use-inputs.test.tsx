import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { UseInputs, type ShelfItem } from "./use-inputs";
import type { StockLot } from "@/lib/domain/draws";

const ITEMS: ShelfItem[] = [
  { inputType: "urea", label: "Urea (46-0-0)", unit: "kg", category: "care", onHand: 120 },
  { inputType: "diuron", label: "Diuron", unit: "litre", category: "protection", onHand: 8 },
];

const STOCK: StockLot[] = [
  { purchaseId: "a", inputType: "urea", date: "2026-01-10", remaining: 120, unitCostCentavos: 2200 },
  { purchaseId: "b", inputType: "diuron", date: "2026-02-01", remaining: 8, unitCostCentavos: 65000 },
];

const render = (over: Partial<Parameters<typeof UseInputs>[0]> = {}) =>
  renderToStaticMarkup(
    <UseInputs cycleId="c1" items={ITEMS} stock={STOCK} closed={false} {...over} />,
  );

describe("recording inputs used on a plot", () => {
  it("stays shut until tapped", () => {
    // This sits on the screen he reads most. A form full of empty boxes on
    // every plot page would be noise.
    const html = render();
    expect(html).toContain("Record inputs used");
    expect(html).not.toContain("Leave the rest blank");
  });

  it("says nothing at all on a closed cycle", () => {
    // A closed cycle's P&L is frozen; offering to add to it would be a lie.
    expect(render({ closed: true })).toBe("");
  });

  it("explains itself rather than showing an empty shed", () => {
    const html = render({ items: [], stock: [] });
    expect(html).toContain("Nothing in the shed");
    expect(html).not.toContain("Record inputs used");
  });

  it("names the plot's own heading, not the shed's", () => {
    // The Stock screen is where you count sacks. This is where you say what
    // went onto this ground.
    expect(render()).toContain("Inputs used here");
  });
});
