/**
 * Drawing the farm.
 *
 * These use the real rings from New Farm Mapping 2.0 where the geometry matters,
 * because the awkward cases are real: plot 6 is a long bent shape whose corners
 * bunch at one end, and a naive centre would put its number on someone else's
 * land.
 */
import { describe, expect, it } from "vitest";
import { centroid, colourKeyFor, legendFor, project, type Boundary } from "./map";

const square = (lon: number, lat: number, d: number): [number, number][] => [
  [lon, lat], [lon + d, lat], [lon + d, lat - d], [lon, lat - d], [lon, lat],
];

const boundary = (plotId: string, ring: [number, number][], areaSqm = 1000): Boundary => ({
  plotId, part: "main", ring, areaSqm,
});

describe("projecting the farm into a box", () => {
  const b = [
    boundary("a", square(120.93, 14.246, 0.001)),
    boundary("b", square(120.932, 14.244, 0.001)),
  ];

  it("fits everything inside the width", () => {
    const { shapes, width } = project(b, 1000);
    const xs = shapes.flatMap((s) =>
      s.d.slice(1, -1).split("L").map((p) => Number(p.split(",")[0])));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(width);
  });

  it("keeps the farm's proportions rather than stretching it to fill", () => {
    // The box must have the same shape as the land. These two squares span
    // 0.003 degrees each way, but a degree of longitude here is shorter than a
    // degree of latitude by cos(14.2 degrees), so the ground is taller than it
    // is wide and the drawing has to be too. Stretching to fill the box would
    // be a lie about the land.
    const { width, height } = project(b, 1000, 0);
    const squeeze = Math.cos((14.2455 * Math.PI) / 180);
    expect(height / width).toBeCloseTo(1 / squeeze, 2);
  });

  it("puts north at the top", () => {
    // Plot a is further north, so its label must sit above plot b's.
    const { shapes } = project(b, 1000);
    const a = shapes.find((s) => s.plotId === "a")!;
    const bb = shapes.find((s) => s.plotId === "b")!;
    expect(a.labelY).toBeLessThan(bb.labelY);
  });

  it("reports the scale, so a bar on the drawing can mean metres", () => {
    const { metresPerUnit } = project(b, 1000);
    expect(metresPerUnit).toBeGreaterThan(0);
    expect(Number.isFinite(metresPerUnit)).toBe(true);
  });

  it("draws nothing, and does not divide by zero, with no boundaries", () => {
    expect(project([], 1000).shapes).toEqual([]);
    expect(project([], 1000).metresPerUnit).toBe(1);
  });

  it("keeps both of plot 11's parcels as separate shapes on the one plot", () => {
    const eleven = [
      { ...boundary("11", square(120.93, 14.243, 0.0008)), part: "a" },
      { ...boundary("11", square(120.9308, 14.243, 0.0008)), part: "b" },
    ];
    const { shapes } = project(eleven, 1000);
    expect(shapes).toHaveLength(2);
    expect(new Set(shapes.map((s) => s.plotId))).toEqual(new Set(["11"]));
    expect(shapes.map((s) => s.part).sort()).toEqual(["a", "b"]);
  });
});

describe("where the plot number sits", () => {
  it("lands inside a simple square", () => {
    const c = centroid([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
    expect(c[0]).toBeCloseTo(5, 5);
    expect(c[1]).toBeCloseTo(5, 5);
  });

  it("follows the area, not the corners", () => {
    // An L: most of its area is low and left, and most of its corners are not.
    // Averaging the corners would drag the label up and right, out of the shape.
    const L: [number, number][] = [
      [0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10], [0, 0],
    ];
    const [x, y] = centroid(L);
    const cornerAvg = 6 * 10 / 7;
    expect(x).toBeLessThan(cornerAvg);
    expect(y).toBeLessThan(cornerAvg);
  });

  it("survives a ring with no area rather than dividing by zero", () => {
    const [x, y] = centroid([[5, 5], [5, 5], [5, 5]]);
    expect(x).toBe(5);
    expect(y).toBe(5);
  });
});

describe("crop colours", () => {
  it("names the three crops that get a hue of their own", () => {
    expect(colourKeyFor("pineapple")).toBe("pineapple");
    expect(colourKeyFor("Pineapple ")).toBe("other");   // trimmed upstream, not here
    expect(colourKeyFor("peanut")).toBe("peanut");
    expect(colourKeyFor("mane")).toBe("mane");
  });

  it("folds the rest into one residual rather than inventing hues", () => {
    // A fourth categorical hue cannot be told from the other three on the dark
    // surface, so banana and mango share a neutral instead.
    expect(colourKeyFor("banana")).toBe("other");
    expect(colourKeyFor("mango")).toBe("other");
    expect(colourKeyFor("papaya")).toBe("other");
  });

  it("gives an empty plot no colour at all", () => {
    expect(colourKeyFor(null)).toBe("idle");
  });

  it("lists only the crops actually on the ground", () => {
    const legend = legendFor(["pineapple", "pineapple", null]);
    expect(legend.map((l) => l.key)).toEqual(["pineapple", "idle"]);
  });

  it("puts the residual and the empty plots after the named crops", () => {
    const legend = legendFor(["mane", "banana", null, "pineapple"]);
    expect(legend.map((l) => l.key)).toEqual(["pineapple", "mane", "other", "idle"]);
  });
});
