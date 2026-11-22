import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
import { renderToStaticMarkup } from "react-dom/server";
import { InputsClient, LiquidateForm, PurchaseForm } from "./inputs-client";

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
      inputTypes={[
        { code: "fert_0_0_60", label: "Muriate of potash (0-0-60)", unit: "kg", kgPerUnit: null, category: "care" },
        { code: "diuron", label: "Diuron", unit: "litre", kgPerUnit: null, category: "protection" },
        { code: "ethrel", label: "Ethrel (ethephon)", unit: "litre", kgPerUnit: null, category: "forcing" },
      ]}
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

describe("what can be bought", () => {
  const TYPES = [
    { code: "fert_0_0_60", label: "Muriate of potash (0-0-60)", unit: "kg", kgPerUnit: null, category: "care" as const },
    { code: "diuron", label: "Diuron", unit: "litre", kgPerUnit: null, category: "protection" as const },
    { code: "ethrel", label: "Ethrel (ethephon)", unit: "litre", kgPerUnit: null, category: "forcing" as const },
  ];
  const buy = (types = TYPES) => renderToStaticMarkup(<PurchaseForm inputTypes={types} />);

  // Anthony is in a field with one hand free. Thirty chips in one run put
  // weedkiller next to fertiliser; these are three short runs with headings.
  it("sorts the shed onto shelves", () => {
    const html = buy();
    expect(html).toContain("Crop care");
    expect(html).toContain("Crop protection");
    expect(html).toContain("Forcing");
  });

  it("puts feeding the crop first and forcing last", () => {
    const html = buy();
    expect(html.indexOf("Crop care")).toBeLessThan(html.indexOf("Crop protection"));
    expect(html.indexOf("Crop protection")).toBeLessThan(html.indexOf("Forcing"));
  });

  it("shows no empty shelf", () => {
    const html = buy(TYPES.filter((t) => t.category === "care"));
    expect(html).toContain("Crop care");
    expect(html).not.toContain("Crop protection");
    expect(html).not.toContain("Forcing");
  });

  it("names things the way the protocol and the sack both do", () => {
    // "Muriate of potash" is the husband's and the protocol's word; "0-0-60"
    // is printed on the sack Anthony is holding. Neither alone is enough.
    const html = buy();
    expect(html).toContain("Muriate of potash (0-0-60)");
    expect(html).not.toContain("Fertilizer 0-0-60");
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

  it("tells him what to do with the money instead of keeping it", () => {
    // The app records no sale, so the proceeds must leave the float or cash on
    // hand drifts. Saying "hand it to Jamie" is the instruction, not a warning.
    expect(sell()).toContain("Hand the money to Jamie");
    expect(sell()).toContain("do not spend it from the float");
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
