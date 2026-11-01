import { describe, expect, it } from "vitest";
import { INK, SIZES, pathOf, readMarks, type Mark } from "./annotations";

const pen = {
  id: "m1", kind: "pen", ink: "red", size: "medium",
  points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
};
const text = {
  id: "m2", kind: "text", ink: "amber", size: "large",
  at: { x: 0.5, y: 0.5 }, text: "tip burn",
};

describe("reading marks back off a photo", () => {
  it("keeps a stroke and a label", () => {
    const marks = readMarks([pen, text]);
    expect(marks).toHaveLength(2);
    expect(marks[0]!.kind).toBe("pen");
    expect(marks[1]!.kind).toBe("text");
  });

  /**
   * This column is written by a browser and read by every screen that shows a
   * photo. One malformed shape must cost that mark — never the photograph,
   * and never the page.
   */
  it("drops a bad mark rather than losing the good ones", () => {
    const marks = readMarks([
      pen,
      null,
      "not a mark",
      { id: "x", kind: "pen" },
      { id: "y", kind: "pen", ink: "puce", size: "medium", points: pen.points },
      { id: "z", kind: "pen", ink: "red", size: "enormous", points: pen.points },
      { kind: "pen", ink: "red", size: "medium", points: pen.points },
      text,
    ]);
    expect(marks.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("survives a column that is not a list at all", () => {
    expect(readMarks(null)).toEqual([]);
    expect(readMarks({})).toEqual([]);
    expect(readMarks("[]")).toEqual([]);
    expect(readMarks(undefined)).toEqual([]);
  });

  it("ignores a tap, which is not a stroke", () => {
    expect(readMarks([{ ...pen, points: [{ x: 0.1, y: 0.1 }] }])).toEqual([]);
  });

  it("ignores a label with nothing written on it", () => {
    expect(readMarks([{ ...text, text: "   " }])).toEqual([]);
  });

  /**
   * A finger that ran off the edge of the picture genuinely went there, so
   * the stroke is kept and pulled back to the edge rather than thrown away.
   */
  it("pulls a stroke that ran off the picture back to the edge", () => {
    const marks = readMarks([
      { ...pen, points: [{ x: -0.5, y: 0.2 }, { x: 1.8, y: 0.4 }] },
    ]);
    const stroke = marks[0] as Extract<Mark, { kind: "pen" }>;
    expect(stroke.points[0]!.x).toBe(0);
    expect(stroke.points[1]!.x).toBe(1);
  });

  it("drops a point that is not a number, including NaN", () => {
    expect(readMarks([{ ...pen, points: [{ x: NaN, y: 0.2 }, { x: "a", y: 1 }] }])).toEqual([]);
  });

  it("refuses to be filled up without limit", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ ...pen, id: `m${i}` }));
    expect(readMarks(many)).toHaveLength(200);
  });
});

describe("drawing a stroke at whatever size the picture is shown", () => {
  /**
   * Coordinates are fractions of the image, so a circle round a leaf tip is
   * round the same leaf tip on his phone and on her laptop.
   */
  it("scales to the rendered size", () => {
    const d = pathOf([{ x: 0, y: 0 }, { x: 0.5, y: 1 }], 400, 300);
    expect(d).toBe("M0.0,0.0 L200.0,300.0");
  });

  it("is harmless when there is nothing to draw", () => {
    expect(pathOf([], 400, 300)).toBe("");
  });
});

describe("the palette", () => {
  it("offers colours that show up on both soil and sky", () => {
    expect(Object.keys(INK)).toContain("red");
    expect(Object.keys(INK)).toContain("white");
  });

  it("sizes the pen and the text as fractions, not pixels", () => {
    for (const size of Object.values(SIZES)) {
      expect(size.pen).toBeLessThan(1);
      expect(size.text).toBeLessThan(1);
    }
  });
});
