import { describe, expect, it } from "vitest";
import {
  apportion, basisFor, blockedFraction, sharesOf, subPlotLedger, type SubPlot,
} from "./subplots";

const block = (id: string, landPct: number, plantCount: number | null = null): SubPlot => ({
  id, cycleId: "c1", name: id.toUpperCase(), plantedOn: "2026-03-05",
  landPct, plantCount, targetForcingDate: null, forcedOn: null,
});

describe("which number divides a shared cost", () => {
  /**
   * Weeding a block twice the size takes twice the morning; abono goes on the
   * plants, not the ground. A block that is 30% of the land but holds 45% of
   * the plants drinks 45% of the fertiliser, and charging it 30% would make it
   * look cheaper than it is for the whole cycle.
   */
  it("uses the land for work done on the ground", () => {
    expect(basisFor("Labor")).toBe("land");
    expect(basisFor("Machines")).toBe("land");
    expect(basisFor("Farm Transport")).toBe("land");
  });

  it("uses the plants for what is bought and applied to them", () => {
    expect(basisFor("Farm Inputs")).toBe("plants");
  });
});

describe("each block's share of the plot", () => {
  it("is its own share of the whole, not of the blocked part", () => {
    const shares = sharesOf([block("a", 50), block("b", 30)], "land");
    expect(shares.get("a")).toBeCloseTo(0.5);
    expect(shares.get("b")).toBeCloseTo(0.3);
  });

  /**
   * While he is still planting, the blocks cover part of the plot and the rest
   * is land costs are still being spent on. Normalising that away would charge
   * the blocks for ground they do not occupy.
   */
  it("leaves the unblocked land unblocked rather than normalising it away", () => {
    const shares = sharesOf([block("a", 40), block("b", 20)], "land");
    expect([...shares.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(0.6);
  });

  it("splits by plants when every block has been counted", () => {
    // 60% of the plot is blocked; the plants inside it are 3:1.
    const shares = sharesOf([block("a", 30, 9000), block("b", 30, 3000)], "plants");
    expect(shares.get("a")).toBeCloseTo(0.45);
    expect(shares.get("b")).toBeCloseTo(0.15);
    expect([...shares.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(0.6);
  });

  /**
   * A block he has not counted yet cannot answer "how many plants", and a zero
   * would quietly move its whole share of every input into "unassigned" — which
   * reads as "we spent nothing on it".
   */
  it("falls back to the land when a block has not been counted", () => {
    const shares = sharesOf([block("a", 40, 6000), block("b", 30, null)], "plants");
    expect(shares.get("a")).toBeCloseTo(0.4);
    expect(shares.get("b")).toBeCloseTo(0.3);
  });
});

describe("dividing a cost across the blocks", () => {
  it("gives each block its share", () => {
    const { bySubPlot, unassignedCentavos } = apportion(
      100000, sharesOf([block("a", 50), block("b", 50)], "land"),
    );
    expect(bySubPlot.get("a")).toBe(50000);
    expect(bySubPlot.get("b")).toBe(50000);
    expect(unassignedCentavos).toBe(0);
  });

  it("holds back what belongs to land not yet blocked out", () => {
    const { bySubPlot, unassignedCentavos } = apportion(
      100000, sharesOf([block("a", 40), block("b", 20)], "land"),
    );
    expect(bySubPlot.get("a")).toBe(40000);
    expect(bySubPlot.get("b")).toBe(20000);
    expect(unassignedCentavos).toBe(40000);
  });

  /**
   * The parts plus the remainder must equal the amount to the centavo. A total
   * that does not add up is the thing this whole app exists to prevent, and
   * thirds are where naive rounding loses a centavo.
   */
  it("adds back to the amount exactly, however awkward the thirds", () => {
    for (const amount of [100, 1, 999999, 33333, 7, 1000001]) {
      const shares = sharesOf(
        [block("a", 33.33), block("b", 33.33), block("c", 33.34)], "land",
      );
      const { bySubPlot, unassignedCentavos } = apportion(amount, shares);
      const sum = [...bySubPlot.values()].reduce((x, y) => x + y, 0);
      expect(sum + unassignedCentavos).toBe(amount);
      expect(unassignedCentavos).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives the whole amount to one block that covers the plot", () => {
    const { bySubPlot, unassignedCentavos } = apportion(
      12345, sharesOf([block("a", 100)], "land"),
    );
    expect(bySubPlot.get("a")).toBe(12345);
    expect(unassignedCentavos).toBe(0);
  });

  /** Before he has blocked anything out, the cost is simply the plot's. */
  it("leaves everything unassigned when there are no blocks", () => {
    const { bySubPlot, unassignedCentavos } = apportion(5000, sharesOf([], "land"));
    expect(bySubPlot.size).toBe(0);
    expect(unassignedCentavos).toBe(5000);
  });

  it("divides a single centavo without inventing a second one", () => {
    const { bySubPlot, unassignedCentavos } = apportion(
      1, sharesOf([block("a", 50), block("b", 50)], "land"),
    );
    const sum = [...bySubPlot.values()].reduce((x, y) => x + y, 0);
    expect(sum + unassignedCentavos).toBe(1);
  });

  it("handles a cost of nothing", () => {
    const { unassignedCentavos } = apportion(0, sharesOf([block("a", 50)], "land"));
    expect(unassignedCentavos).toBe(0);
  });
});

describe("how much of the plot is spoken for", () => {
  it("reports the fraction blocked out so far", () => {
    expect(blockedFraction([block("a", 40), block("b", 35)])).toBeCloseTo(0.75);
    expect(blockedFraction([])).toBe(0);
  });
});

describe("a cycle's costs laid out block by block", () => {
  const blocks = [block("a", 50, 6000), block("b", 50, 4000)];

  it("gives a tagged cost wholly to its block", () => {
    const { blocks: out, unassignedCentavos } = subPlotLedger(blocks, [
      { subPlotId: "a", category: "Labor", amountCentavos: 100000 },
    ]);
    expect(out[0]!.directCentavos).toBe(100000);
    expect(out[1]!.directCentavos).toBe(0);
    expect(unassignedCentavos).toBe(0);
  });

  it("divides an untagged cost by land, and an input cost by plants", () => {
    const { blocks: out } = subPlotLedger(blocks, [
      { subPlotId: null, category: "Labor", amountCentavos: 100000 },
      { subPlotId: null, category: "Farm Inputs", amountCentavos: 100000 },
    ]);
    // Labour 50/50 by land; abono 60/40 by plants.
    expect(out[0]!.sharedCentavos).toBe(50000 + 60000);
    expect(out[1]!.sharedCentavos).toBe(50000 + 40000);
  });

  /**
   * The figure the owners actually compare between blocks. A March block and
   * a May block on one plot is precisely the comparison the farm could not
   * make before, and it is meaningless unless the costs behind it add up.
   */
  it("works out cost per plant from the block's own count", () => {
    const { blocks: out } = subPlotLedger(blocks, [
      { subPlotId: null, category: "Labor", amountCentavos: 100000 },
    ]);
    expect(out[0]!.costPerPlantCentavos).toBe(Math.round(50000 / 6000));
    expect(out[1]!.costPerPlantCentavos).toBe(Math.round(50000 / 4000));
  });

  it("says nothing about cost per plant for a block nobody has counted", () => {
    const { blocks: out } = subPlotLedger([block("a", 100, null)], [
      { subPlotId: null, category: "Labor", amountCentavos: 100000 },
    ]);
    expect(out[0]!.costPerPlantCentavos).toBeNull();
  });

  it("every centavo lands somewhere, block or unassigned", () => {
    const partial = [block("a", 40, 6000), block("b", 20, 2000)];
    const costs = [
      { subPlotId: null, category: "Labor" as const, amountCentavos: 99991 },
      { subPlotId: "a", category: "Labor" as const, amountCentavos: 12345 },
      { subPlotId: null, category: "Farm Inputs" as const, amountCentavos: 7777 },
    ];
    const led = subPlotLedger(partial, costs);
    const sum = led.blocks.reduce((a, b) => a + b.totalCentavos, 0);
    expect(sum + led.unassignedCentavos).toBe(led.totalCentavos);
    expect(led.totalCentavos).toBe(99991 + 12345 + 7777);
  });

  /**
   * A cost tagged to a block that has since been deleted must not vanish. The
   * database already frees the allocation; this makes sure the arithmetic
   * treats it as the plot's again rather than dropping it.
   */
  it("treats a cost tagged to a block that no longer exists as the plot's", () => {
    const led = subPlotLedger([block("a", 100, 1000)], [
      { subPlotId: "gone", category: "Labor", amountCentavos: 5000 },
    ]);
    expect(led.blocks[0]!.sharedCentavos).toBe(5000);
    expect(led.totalCentavos).toBe(5000);
  });
});
