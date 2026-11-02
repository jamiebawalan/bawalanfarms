import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlotSummary, oneLabelPerPlot, type MapShape } from "./farm-map";

const piece = (
  plotId: string, part: string, labelX: number, labelY: number, areaSqm: number,
): MapShape => ({
  plotId, part, areaSqm, d: "M0,0Z", labelX, labelY,
  label: `Plot ${plotId}`, code: plotId, crop: "pineapple",
  cycleId: "c1", colourKey: "pineapple", months: 9, tasks: [],
  surveyedSqm: areaSqm, plantedOn: "2026-02-01", plants: 2650,
});

describe("putting one number on each plot", () => {
  it("leaves a plot drawn as one shape exactly where it was", () => {
    const [only] = oneLabelPerPlot([piece("7", "main", 100, 200, 7391)]);
    expect(only!.labelX).toBe(100);
    expect(only!.labelY).toBe(200);
  });

  /**
   * Plot 11 is traced as two parcels three and a half metres apart. It used
   * to get its number printed on each of them, which read as two plots.
   */
  it("prints one number for a plot traced as two parcels", () => {
    const labels = oneLabelPerPlot([
      piece("11", "a", 100, 100, 3689.1),
      piece("11", "b", 200, 100, 3459.3),
    ]);
    expect(labels).toHaveLength(1);
    expect(labels[0]!.code).toBe("11");
  });

  it("places it by area, not midway between the pieces", () => {
    const [label] = oneLabelPerPlot([
      piece("11", "a", 0, 0, 9000),
      piece("11", "b", 100, 0, 1000),
    ]);
    // Nine tenths of the land is at x=0, so the number belongs near it.
    expect(label!.labelX).toBeCloseTo(10);
  });

  it("keeps every plot, and only one label each", () => {
    const labels = oneLabelPerPlot([
      piece("11", "a", 0, 0, 100),
      piece("11", "b", 10, 0, 100),
      piece("7", "main", 50, 50, 100),
      piece("9", "main", 90, 90, 100),
    ]);
    expect(labels.map((l) => l.code).sort()).toEqual(["11", "7", "9"]);
  });

  /**
   * Without areas to weight by, the midpoint of two parcels can land in the
   * gap between them — on a neighbour's field. The largest piece keeps it.
   */
  it("falls back to the largest piece when no areas are known", () => {
    const [label] = oneLabelPerPlot([
      piece("11", "a", 0, 0, 0),
      piece("11", "b", 100, 0, 0),
    ]);
    expect([0, 100]).toContain(label!.labelX);
  });

  it("does not fall over on an empty map", () => {
    expect(oneLabelPerPlot([])).toEqual([]);
  });
});

describe("what a plot says when you tap it", () => {
  const shape = piece("11", "main", 0, 0, 6364.3);

  it("answers the three questions without leaving the map", () => {
    const html = renderToStaticMarkup(<PlotSummary shape={shape} />);
    expect(html).toContain("0.64 ha");
    expect(html).toContain("2,650");
    expect(html).toContain("01 Feb 2026");
  });

  it("keeps the year on the planting date", () => {
    // "01 Feb" alone is ambiguous by exactly the amount that matters.
    const html = renderToStaticMarkup(<PlotSummary shape={shape} />);
    expect(html).toMatch(/Feb 2026/);
  });

  it("says what is missing rather than showing a zero", () => {
    const html = renderToStaticMarkup(
      <PlotSummary shape={{ ...shape, surveyedSqm: null, plants: null, plantedOn: null }} />,
    );
    expect(html).toContain("not surveyed");
    expect(html).toContain("not counted");
    expect(html).toContain("not recorded");
    expect(html).not.toContain("0.00 ha");
  });
});
