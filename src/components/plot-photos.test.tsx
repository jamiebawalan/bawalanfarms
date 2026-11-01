/**
 * @vitest-environment jsdom
 *
 * What a photo is called when nobody called it anything.
 *
 * Most of them are never captioned — he is holding a phone over a pineapple,
 * not writing labels — so a gallery of "(no caption)" would be a gallery of
 * nothing. The day and time it went up is always true and costs him nothing.
 */
import { describe, expect, it } from "vitest";
import { photoLabel, type Photo } from "./plot-photos";

const photo = (over: Partial<Photo> = {}): Photo => ({
  id: "p1",
  takenOn: "2026-10-24",
  caption: null,
  addedAt: "2026-10-24T06:32:00Z",
  ...over,
});

describe("what a photo is called", () => {
  it("uses the caption when there is one", () => {
    expect(photoLabel(photo({ caption: "north end, weeds" }))).toBe("north end, weeds");
  });

  it("falls back to the day it was taken and the time it went up", () => {
    const label = photoLabel(photo());
    expect(label).toContain("24 Oct 2026");
    expect(label).toMatch(/\d{1,2}:\d{2}/);
  });

  /** A caption of spaces is nobody's description of anything. */
  it("treats an empty caption as no caption", () => {
    expect(photoLabel(photo({ caption: "   " }))).toContain("24 Oct 2026");
    expect(photoLabel(photo({ caption: "" }))).toContain("24 Oct 2026");
  });

  /**
   * The upload time comes from the database. A row written before that column
   * existed, or by hand, should still name the photo rather than crash the
   * whole gallery with "Invalid Date".
   */
  it("still names a photo whose upload time is missing or nonsense", () => {
    expect(photoLabel(photo({ addedAt: "" }))).toBe("24 Oct 2026");
    expect(photoLabel(photo({ addedAt: "not a date" }))).toBe("24 Oct 2026");
  });
});
