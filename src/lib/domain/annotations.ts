/**
 * Marks on a photograph.
 *
 * A pen stroke round a leaf tip, and a word beside it. Kept as shapes rather
 * than painted into the picture, so that any one of them can be removed later
 * and the photograph itself is never overwritten.
 *
 * Every coordinate is a fraction of the image — 0 is the left edge, 1 the
 * right — so a circle round a leaf tip is round the same leaf tip on his
 * phone, on her laptop, and on whatever the picture is scaled to next.
 */

export const INK = {
  red: "#e02424",
  amber: "#f59e0b",
  green: "#16a34a",
  blue: "#2563eb",
  white: "#ffffff",
  black: "#111827",
} as const;

export type InkName = keyof typeof INK;

/** Pen widths and text sizes, as fractions of the image's smaller side. */
export const SIZES = {
  small: { pen: 0.004, text: 0.035, label: "Small" },
  medium: { pen: 0.008, text: 0.055, label: "Medium" },
  large: { pen: 0.014, text: 0.085, label: "Large" },
} as const;

export type SizeName = keyof typeof SIZES;

export type Point = { x: number; y: number };

export type Mark =
  | { id: string; kind: "pen"; ink: InkName; size: SizeName; points: Point[] }
  | { id: string; kind: "text"; ink: InkName; size: SizeName; at: Point; text: string };

/**
 * Read marks back from the database defensively.
 *
 * This column is written by a browser and read by every screen that shows a
 * photo. One malformed shape — an old format, a half-finished write, a stroke
 * with a null in it — must cost that one mark, never the photograph and never
 * the page. Anything unrecognisable is dropped silently rather than thrown.
 */
export function readMarks(raw: unknown): Mark[] {
  if (!Array.isArray(raw)) return [];
  const out: Mark[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const m = item as Record<string, unknown>;
    const id = typeof m.id === "string" ? m.id : null;
    const ink = typeof m.ink === "string" && m.ink in INK ? (m.ink as InkName) : null;
    const size = typeof m.size === "string" && m.size in SIZES ? (m.size as SizeName) : null;
    if (id === null || ink === null || size === null) continue;

    if (m.kind === "pen") {
      const points = readPoints(m.points);
      // One point is a tap, not a stroke, and draws nothing.
      if (points.length >= 2) out.push({ id, kind: "pen", ink, size, points });
      continue;
    }

    if (m.kind === "text") {
      const at = readPoint(m.at);
      const text = typeof m.text === "string" ? m.text.slice(0, 120) : "";
      if (at !== null && text.trim() !== "") {
        out.push({ id, kind: "text", ink, size, at, text });
      }
    }
  }

  return out.slice(0, 200);
}

function readPoints(raw: unknown): Point[] {
  if (!Array.isArray(raw)) return [];
  const points: Point[] = [];
  for (const p of raw) {
    const point = readPoint(p);
    if (point !== null) points.push(point);
  }
  // A stroke is sampled from a finger dragging; several hundred points is a
  // long sweep, and beyond that it is a runaway rather than a drawing.
  return points.slice(0, 2000);
}

function readPoint(raw: unknown): Point | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.x !== "number" || typeof p.y !== "number") return null;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  // Clamped rather than rejected: a stroke that ran off the edge of the
  // picture is a real stroke, and the finger genuinely went there.
  return { x: clamp(p.x), y: clamp(p.y) };
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** What a stroke looks like as an SVG path, at any rendered size. */
export function pathOf(points: readonly Point[], width: number, height: number): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * width).toFixed(1)},${(p.y * height).toFixed(1)}`)
    .join(" ");
}

export function describeMark(mark: Mark): string {
  return mark.kind === "text" ? `“${mark.text}”` : "Drawing";
}
