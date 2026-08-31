/**
 * Turning boundary rings into something drawable.
 *
 * The farm sits inside about a kilometre of latitude, so a plain equirectangular
 * projection — longitude squeezed by the cosine of the latitude — is faithful to
 * a fraction of a metre at this size. Anything more elaborate would be precision
 * the traced boundaries do not have.
 */

import type { Plot } from "./types";

export type Ring = [number, number][];

export type Boundary = {
  plotId: string;
  part: string;
  ring: Ring;
  areaSqm: number;
};

export type Shape = {
  plotId: string;
  part: string;
  /** An SVG path in viewBox units. */
  d: string;
  /** Where the plot number goes: the polygon's own centre of area. */
  labelX: number;
  labelY: number;
  areaSqm: number;
};

export type Projected = {
  shapes: Shape[];
  width: number;
  height: number;
  /** Metres per viewBox unit, for drawing a scale bar that means something. */
  metresPerUnit: number;
};

const EARTH_M_PER_DEGREE = 111_320;

/**
 * Fits every ring into a box of the given width, keeping the farm's true
 * proportions. North stays up, so the drawing matches what someone sees in
 * Google Earth and in their head.
 */
export function project(boundaries: Boundary[], width = 1000, pad = 12): Projected {
  const points = boundaries.flatMap((b) => b.ring);
  if (points.length === 0) {
    return { shapes: [], width, height: width, metresPerUnit: 1 };
  }

  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const midLat = (minLat + maxLat) / 2;
  const squeeze = Math.cos((midLat * Math.PI) / 180);

  // Local metres, x east and y south, before scaling to the box.
  const toLocal = ([lon, lat]: [number, number]): [number, number] => [
    (lon - minLon) * squeeze * EARTH_M_PER_DEGREE,
    (maxLat - lat) * EARTH_M_PER_DEGREE,
  ];

  const spanX = (maxLon - minLon) * squeeze * EARTH_M_PER_DEGREE;
  const spanY = (maxLat - minLat) * EARTH_M_PER_DEGREE;
  const scale = (width - pad * 2) / Math.max(spanX, 1e-9);
  const height = spanY * scale + pad * 2;

  const shapes = boundaries.map((b) => {
    const pts = b.ring.map((p) => {
      const [x, y] = toLocal(p);
      return [x * scale + pad, y * scale + pad] as [number, number];
    });
    const [cx, cy] = centroid(pts);
    return {
      plotId: b.plotId,
      part: b.part,
      d: `M${pts.map(([x, y]) => `${round(x)},${round(y)}`).join("L")}Z`,
      labelX: round(cx),
      labelY: round(cy),
      areaSqm: b.areaSqm,
    };
  });

  return { shapes, width, height: round(height), metresPerUnit: 1 / scale };
}

/**
 * The centre of area, not the average of the corners.
 *
 * On a plot like 6 or 23 — long, bent, with corners bunched at one end — the
 * average of the corners lands outside the shape, and the number would sit on
 * a neighbour's land.
 */
export function centroid(points: [number, number][]): [number, number] {
  let twiceArea = 0, x = 0, y = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    // A degenerate ring: fall back to the average rather than dividing by zero.
    const n = points.length;
    return [
      points.reduce((a, p) => a + p[0], 0) / n,
      points.reduce((a, p) => a + p[1], 0) / n,
    ];
  }
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

/**
 * Crop colours.
 *
 * Three named crops and a residual, because four categorical hues cannot be
 * told apart on the dark surface — checked with the palette validator across
 * every pair, not just neighbouring ones, since on a map any two plots can end
 * up side by side. Everything else folds into "Other" in a neutral, which is
 * honest: "Other" is a residual, not an identity, and should not wear a hue as
 * though it were one.
 *
 * A plot with nothing growing on it is not coloured at all. Empty land reading
 * as empty is the most useful thing this map does.
 */
export const CROP_COLOURS: Record<string, { light: string; dark: string; label: string }> = {
  pineapple: { light: "#eda100", dark: "#c98500", label: "Pineapple" },
  peanut: { light: "#1baf7a", dark: "#199e70", label: "Peanut" },
  mane: { light: "#2a78d6", dark: "#3987e5", label: "Mane" },
};

export const OTHER_CROP = { light: "#8a8f8a", dark: "#79817b", label: "Other crop" };

export function colourKeyFor(crop: string | null): string {
  if (crop === null) return "idle";
  return crop.toLowerCase() in CROP_COLOURS ? crop.toLowerCase() : "other";
}

/** Which crops are actually on the ground, in the order the legend shows them. */
export function legendFor(crops: (string | null)[]): { key: string; label: string }[] {
  const present = new Set(crops.map(colourKeyFor));
  const items = Object.entries(CROP_COLOURS)
    .filter(([key]) => present.has(key))
    .map(([key, v]) => ({ key, label: v.label }));
  if (present.has("other")) items.push({ key: "other", label: OTHER_CROP.label });
  if (present.has("idle")) items.push({ key: "idle", label: "Nothing planted" });
  return items;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

export type PlotShape = Shape & {
  plot: Plot;
  crop: string | null;
  cycleId: string | null;
  colourKey: string;
};
