import { describe, expect, it } from "vitest";
import {
  drawCostCentavos,
  plantCountAsOf,
  remainingStock,
  suggestDrawQuantity,
} from "./dosing";

const counts = [
  { date: "2024-02-01", count: 12_000 },
  { date: "2024-08-15", count: 11_400 },
  { date: "2024-05-01", count: 11_800 },
];

describe("plantCountAsOf", () => {
  it("uses the latest count on or before the date, not the newest overall", () => {
    // A February dose must use February's count even after August's recount.
    expect(plantCountAsOf(counts, "2024-03-01")!.count).toBe(12_000);
    expect(plantCountAsOf(counts, "2024-06-01")!.count).toBe(11_800);
    expect(plantCountAsOf(counts, "2024-12-31")!.count).toBe(11_400);
  });

  it("counts an observation made on the day itself", () => {
    expect(plantCountAsOf(counts, "2024-05-01")!.count).toBe(11_800);
  });

  it("returns nothing before the first count was ever made", () => {
    expect(plantCountAsOf(counts, "2024-01-01")).toBeNull();
    expect(plantCountAsOf([], "2024-01-01")).toBeNull();
  });
});

describe("suggestDrawQuantity", () => {
  it("turns a plant count into sacks at 40g a plant, 50kg a sack", () => {
    // 12,500 plants x 40g = 500kg = exactly 10 sacks.
    const s = suggestDrawQuantity({
      observations: [{ date: "2024-02-01", count: 12_500 }],
      onDate: "2024-03-01",
      kgPerUnit: 50,
    })!;
    expect(s.quantity).toBe(10);
    expect(s.plantCount).toBe(12_500);
    expect(s.countDate).toBe("2024-02-01");
    expect(s.workingNote).toContain("1,250 plants");
  });

  it("shows its working so he can check the sum at a glance", () => {
    const s = suggestDrawQuantity({
      observations: [{ date: "2024-02-01", count: 15_600 }],
      onDate: "2024-02-10",
      kgPerUnit: 50,
    })!;
    expect(s.quantity).toBe(12.48);
    expect(s.workingNote).toBe(
      "15,600 plants at 40g = 12.48 sacks (one 50kg sack covers 1,250 plants)",
    );
  });

  it("offers nothing for an input that is not dosed per plant", () => {
    // Herbicide is measured by the sprayer, so the field stays empty rather
    // than proposing a number nobody meant.
    expect(
      suggestDrawQuantity({
        observations: [{ date: "2024-02-01", count: 12_500 }],
        onDate: "2024-03-01",
        kgPerUnit: null,
      }),
    ).toBeNull();
  });

  it("offers nothing when the cycle has never been counted", () => {
    expect(
      suggestDrawQuantity({ observations: [], onDate: "2024-03-01", kgPerUnit: 50 }),
    ).toBeNull();
  });
});

describe("remainingStock", () => {
  it("reports the balance of a bulk lot", () => {
    // The 250-sack lot that went unattributed in the old book.
    expect(remainingStock(250, [{ quantity: 200 }, { quantity: 9 }])).toBe(41);
  });

  it("does not drift on fractional draws", () => {
    expect(remainingStock(10, [{ quantity: 0.1 }, { quantity: 0.2 }])).toBe(9.7);
  });

  it("is the full quantity before anything is drawn", () => {
    expect(remainingStock(250, [])).toBe(250);
  });
});

describe("drawCostCentavos", () => {
  it("charges only what left the lot", () => {
    // ₱1,100 a sack, 12.48 sacks drawn.
    expect(drawCostCentavos(110_000, 12.48)).toBe(1_372_800);
  });

  it("rounds to whole centavos the way Postgres does", () => {
    expect(drawCostCentavos(333, 0.5)).toBe(167);
  });
});
