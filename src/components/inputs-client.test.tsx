import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { InputsClient, LiquidateForm } from "./inputs-client";

const LOTS = [
  {
    id: "buy1",
    label: "Muriate of potash",
    unit: "kg",
    remaining: 1400,
    unitCostCentavos: 2200,
    kgPerUnit: null,
  },
];

const render = (lots = LOTS) =>
  renderToStaticMarkup(
    <InputsClient
      inputTypes={[{ code: "fert_0_0_60", label: "Muriate of potash", unit: "kg", kgPerUnit: null }]}
      lots={lots}
      cycles={[{ id: "c1", label: "Plot 1 · pineapple", counts: [] }]}
    />,
  );

describe("the stock screen", () => {
  it("offers selling surplus alongside taking stock out and buying", () => {
    const html = render();
    expect(html).toContain("Take stock out");
    expect(html).toContain("Record a purchase");
    expect(html).toContain("Sell surplus");
  });

  it("opens on taking stock out, because that is the daily job", () => {
    // Selling happens a handful of times a year; drawing happens every round.
    expect(render()).toContain("For which cycle?");
  });
});

describe("selling surplus off the shed", () => {
  const sell = (lots = LOTS) => renderToStaticMarkup(<LiquidateForm lots={lots} />);

  it("never asks which cycle or plot it came off", () => {
    // Naming one would charge a plot for stock it never received. That is the
    // whole reason this form exists instead of a draw.
    const html = sell();
    expect(html).not.toContain("For which cycle?");
    expect(html).not.toContain("Plot 1");
  });

  it("shows no value at all until a quantity is typed", () => {
    // A ₱0 panel sitting there would read as "this is worth nothing".
    expect(sell()).not.toContain("Comes off stock on hand");
  });

  it("will not submit an empty form", () => {
    expect(sell()).toContain("disabled=\"\"");
  });

  it("warns that the money is not kept here", () => {
    // Anthony will be holding the cash. If the screen is silent about it, the
    // cash-on-hand figure looks like a shortfall he has to explain.
    expect(sell()).toContain("does not keep what");
  });

  it("offers each lot with how much is left in it", () => {
    expect(sell()).toContain("Muriate of potash");
    expect(sell()).toContain("1400 kg");
  });

  it("says there is nothing to sell rather than showing an empty form", () => {
    const html = sell([]);
    expect(html).toContain("nothing to sell");
    expect(html).not.toContain("How much went out?");
  });
});
