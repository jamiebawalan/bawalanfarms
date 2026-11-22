import { describe, expect, it } from "vitest";
import {
  drawUnits, proposeDraws, toUnits, type Consumed, type InputType, type StockLot,
} from "./draws";
import { formatAmount } from "./protocol";

const sack = (code: string): InputType => ({ code, label: code, unit: "sack", kgPerUnit: 50 });
const kilo = (code: string): InputType => ({ code, label: code, unit: "kg", kgPerUnit: 1 });
const litre = (code: string): InputType => ({ code, label: code, unit: "litre", kgPerUnit: null });

const types = new Map<string, InputType>([
  ["urea", sack("urea")],
  ["zinc_sulfate", kilo("zinc_sulfate")],
  ["movento", litre("movento")],
]);

const lot = (p: Partial<StockLot> & { purchaseId: string; inputType: string }): StockLot => ({
  date: "2026-01-01", remaining: 10, unitCostCentavos: 180_000, ...p,
});

const need = (p: Partial<Consumed> & { materialCode: string; amount: number }): Consumed => ({
  materialName: p.materialCode,
  inputType: p.materialCode,
  isLiquid: false,
  ...p,
});

const propose = (c: Consumed[], s: StockLot[]) => proposeDraws(c, s, types, formatAmount);

describe("converting a dose into what the shed counts in", () => {
  it("reads grams against a 50 kg sack", () => {
    expect(toUnits(6680, false, sack("urea"))).toBe(0.134);
  });

  it("reads grams against a kilo", () => {
    expect(toUnits(31.8, false, kilo("zinc_sulfate"))).toBe(0.032);
  });

  it("reads millilitres against a litre", () => {
    expect(toUnits(3000, true, litre("movento"))).toBe(3);
  });

  it("refuses to compare a solid with a liquid's unit", () => {
    // A wrong conversion here is a draw out by a factor of fifty.
    expect(toUnits(6680, false, litre("movento"))).toBeNull();
    expect(toUnits(3000, true, sack("urea"))).toBeNull();
  });

  it("refuses a sack whose weight nobody recorded", () => {
    expect(toUnits(6680, false, { code: "x", label: "x", unit: "sack", kgPerUnit: null }))
      .toBeNull();
  });
});

describe("proposing the draw", () => {
  it("takes the oldest lot first", () => {
    const p = propose(
      [need({ materialCode: "urea", amount: 50_000 })], // 1 sack
      [
        lot({ purchaseId: "new", inputType: "urea", date: "2026-06-01" }),
        lot({ purchaseId: "old", inputType: "urea", date: "2026-01-01" }),
      ],
    );
    expect(p.lines[0]!.draws.map((d) => d.purchaseId)).toEqual(["old"]);
  });

  it("splits across lots, each at its own cost", () => {
    const p = propose(
      [need({ materialCode: "urea", amount: 150_000 })], // 3 sacks
      [
        lot({ purchaseId: "old", inputType: "urea", date: "2026-01-01",
              remaining: 2, unitCostCentavos: 100_000 }),
        lot({ purchaseId: "new", inputType: "urea", date: "2026-06-01",
              remaining: 5, unitCostCentavos: 200_000 }),
      ],
    );
    expect(p.lines[0]!.draws).toEqual([
      { purchaseId: "old", quantity: 2, unit: "sack", lotDate: "2026-01-01",
        costCentavos: 200_000 },
      { purchaseId: "new", quantity: 1, unit: "sack", lotDate: "2026-06-01",
        costCentavos: 200_000 },
    ]);
    // Two sacks at ₱1,000 plus one at ₱2,000, not three at either price.
    expect(p.totalCostCentavos).toBe(400_000);
  });

  it("says it is short rather than quietly drawing less", () => {
    const p = propose(
      [need({ materialCode: "urea", amount: 150_000 })], // 3 sacks
      [lot({ purchaseId: "only", inputType: "urea", remaining: 1 })],
    );
    expect(p.lines[0]!.draws).toHaveLength(1);
    expect(p.lines[0]!.shortfall).toBe(2);
    expect(p.anyShortfall).toBe(true);
  });

  it("is short by the whole amount when the shed is empty", () => {
    const p = propose([need({ materialCode: "urea", amount: 50_000 })], []);
    expect(p.lines[0]!.draws).toEqual([]);
    expect(p.lines[0]!.shortfall).toBe(1);
  });

  it("never draws the same stock twice in one proposal", () => {
    const p = propose(
      [
        need({ materialCode: "urea", amount: 50_000 }),
        need({ materialCode: "urea", materialName: "Urea again", amount: 50_000 }),
      ],
      [lot({ purchaseId: "one", inputType: "urea", remaining: 1 })],
    );
    const drawn = p.lines.flatMap((l) => l.draws).reduce((a, d) => a + d.quantity, 0);
    expect(drawn).toBe(1);
    expect(p.lines[1]!.shortfall).toBe(1);
  });

  it("leaves a material the farm does not stock alone", () => {
    const p = propose(
      [need({ materialCode: "koh", inputType: null, amount: 330 })],
      [],
    );
    expect(p.lines[0]!.untracked).toBe(true);
    expect(p.lines[0]!.shortfall).toBe(0);
    expect(p.anyShortfall).toBe(false);
  });

  it("shows what was asked for in the words the field uses", () => {
    const p = propose([need({ materialCode: "urea", amount: 6680 })], []);
    expect(p.lines[0]!.wanted).toBe("6.68 kg");
    expect(p.lines[0]!.wantedInUnits).toBe(0.134);
    expect(p.lines[0]!.unit).toBe("sack");
  });

  it("ignores a lot that is already empty", () => {
    const p = propose(
      [need({ materialCode: "urea", amount: 50_000 })],
      [
        lot({ purchaseId: "spent", inputType: "urea", date: "2025-01-01", remaining: 0 }),
        lot({ purchaseId: "good", inputType: "urea", date: "2026-01-01", remaining: 5 }),
      ],
    );
    expect(p.lines[0]!.draws.map((d) => d.purchaseId)).toEqual(["good"]);
  });

  it("does not raid another material's stock", () => {
    const p = propose(
      [need({ materialCode: "zinc_sulfate", amount: 31.8 })],
      [lot({ purchaseId: "urea", inputType: "urea", remaining: 99 })],
    );
    expect(p.lines[0]!.draws).toEqual([]);
    expect(p.lines[0]!.shortfall).toBe(0.032);
  });
});


describe("stock named directly, as the per-plot screen names it", () => {
  // He says "I used 20 kg of urea". Which sack it came off is the app's job.
  const lots: StockLot[] = [
    { purchaseId: "old", inputType: "urea", date: "2026-01-10", remaining: 12, unitCostCentavos: 2_000 },
    { purchaseId: "new", inputType: "urea", date: "2026-03-01", remaining: 50, unitCostCentavos: 2_500 },
    { purchaseId: "other", inputType: "dap", date: "2026-01-01", remaining: 99, unitCostCentavos: 9_999 },
  ];

  it("takes the oldest lot first", () => {
    const got = drawUnits("urea", 10, lots, "kg");
    expect(got.draws).toHaveLength(1);
    expect(got.draws[0]!.purchaseId).toBe("old");
    expect(got.costCentavos).toBe(10 * 2_000);
  });

  it("splits across lots at each lot's own price, not an average", () => {
    // 20 kg = the last 12 of the cheap lot plus 8 of the dearer one. An
    // average price here would quietly misstate every plot's P&L.
    const got = drawUnits("urea", 20, lots, "kg");
    expect(got.draws.map((d) => [d.purchaseId, d.quantity])).toEqual([
      ["old", 12],
      ["new", 8],
    ]);
    expect(got.costCentavos).toBe(12 * 2_000 + 8 * 2_500);
  });

  it("never reaches into another input type's lots", () => {
    const got = drawUnits("urea", 1000, lots, "kg");
    expect(got.draws.every((d) => d.purchaseId !== "other")).toBe(true);
  });

  it("says how much it came up short rather than drawing less in silence", () => {
    // Running short is information: either the shed is emptier than anybody
    // thought, or a purchase was never entered.
    const got = drawUnits("urea", 100, lots, "kg");
    expect(got.shortfall).toBe(38);
  });

  it("leaves the caller's lots untouched, so a screen can re-price freely", () => {
    const before = lots.map((l) => l.remaining);
    drawUnits("urea", 20, lots, "kg");
    drawUnits("urea", 20, lots, "kg");
    expect(lots.map((l) => l.remaining)).toEqual(before);
  });

  it("finds nothing when the shed has none of it", () => {
    const got = drawUnits("ethrel", 5, lots, "litre");
    expect(got.draws).toEqual([]);
    expect(got.shortfall).toBe(5);
    expect(got.costCentavos).toBe(0);
  });
});
