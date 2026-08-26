import { describe, expect, it } from "vitest";
import { splitByArea, checkManualSplit, type PlotAreaInput } from "./split";

const plot = (plotId: string, areaSqm: number | null): PlotAreaInput => ({
  plotId,
  label: `Plot ${plotId}`,
  areaSqm,
});

describe("splitByArea", () => {
  it("splits in proportion to area", () => {
    // 6,000 and 2,000 sqm: a 3:1 split of ₱4,000.
    const r = splitByArea(400_000, [plot("a", 6000), plot("b", 2000)]);
    expect(r.lines.map((l) => l.amountCentavos)).toEqual([300_000, 100_000]);
  });

  it("always adds back to the exact total, however awkward the ratio", () => {
    // Three plots whose areas do not divide the amount cleanly. The database
    // rejects a split that does not total the amount entered, so this is the
    // property that actually has to hold.
    const plots = [plot("a", 7056), plot("b", 6519), plot("c", 2929)];
    for (const total of [1, 2, 7, 99, 100, 12_345, 100_001, 275_000_00]) {
      const r = splitByArea(total, plots);
      const allocated = r.lines.reduce((a, l) => a + l.amountCentavos, 0);
      expect(allocated, `total ${total}`).toBe(total);
    }
  });

  it("adds back to the total across every real plot in the farm", () => {
    const areas = [
      7056, 6519, 2929, 4200, 4143, 5534, 7775, 7802, 2452, 2221, 7935, 3258,
      2075, 6227, 2499, 5276, 4065, 2386, 3273, 2323, 3432, 3265, 3148, 3778,
      6764, 4465,
    ];
    const plots = areas.map((a, i) => plot(String(i + 1), a));
    expect(areas.reduce((a, b) => a + b, 0)).toBe(114_800);

    for (let total = 1; total <= 400; total++) {
      const r = splitByArea(total, plots);
      expect(r.lines.reduce((a, l) => a + l.amountCentavos, 0)).toBe(total);
    }
  });

  it("gives leftover centavos to the plots rounded down hardest", () => {
    // ₱1.00 across three equal plots: 33 + 33 + 34 somewhere, never 33+33+33.
    const r = splitByArea(100, [plot("a", 100), plot("b", 100), plot("c", 100)]);
    const amounts = r.lines.map((l) => l.amountCentavos).sort();
    expect(amounts).toEqual([33, 33, 34]);
  });

  it("splits the same way every time, so re-saving an expense does not reshuffle", () => {
    const plots = [plot("a", 3000), plot("b", 3000), plot("c", 3000)];
    const first = splitByArea(1000, plots).lines.map((l) => l.amountCentavos);
    for (let i = 0; i < 20; i++) {
      expect(splitByArea(1000, plots).lines.map((l) => l.amountCentavos)).toEqual(first);
    }
  });

  it("refuses to give an unsurveyed plot a share, and says so", () => {
    // The coffee plot has no area yet. Treating that as zero would silently
    // hand its share to the other plots.
    const r = splitByArea(300_000, [plot("1", 6000), plot("27", null)]);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.amountCentavos).toBe(300_000);
    expect(r.excluded).toHaveLength(1);
    expect(r.excluded[0]!.plotId).toBe("27");
    expect(r.excluded[0]!.reason).toMatch(/no surveyed area/);
  });

  it("returns nothing to allocate when no plot has an area", () => {
    const r = splitByArea(300_000, [plot("27", null)]);
    expect(r.lines).toEqual([]);
    expect(r.excluded).toHaveLength(1);
  });

  it("handles a zero-peso expense without dividing by zero", () => {
    const r = splitByArea(0, [plot("a", 6000), plot("b", 2000)]);
    expect(r.lines.map((l) => l.amountCentavos)).toEqual([0, 0]);
  });

  it("reports each plot's share as a fraction for the on-screen preview", () => {
    const r = splitByArea(100_000, [plot("a", 7500), plot("b", 2500)]);
    expect(r.lines[0]!.fraction).toBeCloseTo(0.75);
    expect(r.lines[1]!.fraction).toBeCloseTo(0.25);
  });
});

describe("checkManualSplit", () => {
  it("accepts an edited split that still adds up", () => {
    expect(checkManualSplit(500_00, [{ amountCentavos: 300_00 }, { amountCentavos: 200_00 }]))
      .toEqual({ ok: true });
  });

  it("says how far out an edited split is, in centavos", () => {
    const r = checkManualSplit(500_00, [{ amountCentavos: 300_00 }, { amountCentavos: 150_00 }]);
    expect(r).toEqual({ ok: false, differenceCentavos: 50_00 });
  });

  it("reports over-allocation as a negative difference", () => {
    const r = checkManualSplit(500_00, [{ amountCentavos: 400_00 }, { amountCentavos: 200_00 }]);
    expect(r).toEqual({ ok: false, differenceCentavos: -100_00 });
  });
});
