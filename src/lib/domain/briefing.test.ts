import { describe, expect, it } from "vitest";
import { makeLedger } from "./fixture";
import { cycleBriefing } from "./briefing";
import { readSuggestions } from "../advice/suggest";
import { DEFAULT_SETTINGS, type Ledger } from "./types";

const TODAY = "2024-06-01";
const L = makeLedger();

const withLeaf = (readings: { date: string; avgLengthCm: number }[]): Ledger => ({
  ...L,
  leafMeasurements: readings.map((r) => ({
    id: `lm-c1-${r.date}`, cycleId: "c1", date: r.date, avgLengthCm: r.avgLengthCm, sampleSize: 10,
  })),
});

describe("what Claude is told about a plot", () => {
  it("names the plot, the crop and where the cycle is up to", () => {
    const b = cycleBriefing(L, "c1", TODAY)!;
    expect(b.plotLabel).toBe("Plot 1");
    expect(b.text).toContain("Plot 1");
    expect(b.text).toContain("pineapple");
    expect(b.text).toContain("6,000 sqm");
  });

  it("returns nothing for a cycle that does not exist", () => {
    expect(cycleBriefing(L, "nope", TODAY)).toBeNull();
  });

  it("spells out what is missing instead of leaving a silent zero", () => {
    // A model shown "0 plants" reasons about a bare field. A model told the
    // count was never taken says to go and count.
    const bare: Ledger = { ...L, plantCounts: [] };
    const b = cycleBriefing(bare, "c1", TODAY)!;
    expect(b.text).toContain("Plant count: none recorded");
    expect(b.text).toContain("No D-leaf readings have been recorded");
  });

  it("explains the forcing rule in the same terms the farm uses", () => {
    const b = cycleBriefing(L, "c1", TODAY)!;
    expect(b.text).toContain(`${DEFAULT_SETTINGS.dleafForcingCm} cm`);
    expect(b.text).toContain(`${DEFAULT_SETTINGS.dleafSampleSize} randomly chosen plants`);
  });

  it("refuses to imply a growth rate from a single reading", () => {
    const b = cycleBriefing(withLeaf([{ date: "2024-05-01", avgLengthCm: 70 }]), "c1", TODAY)!;
    expect(b.text).toContain("Growth rate: unknown");
    expect(b.text).not.toContain("Projected forcing");
  });

  it("gives the rate and the projected forcing date once there are two", () => {
    const b = cycleBriefing(
      withLeaf([
        { date: "2024-04-01", avgLengthCm: 60 },
        { date: "2024-05-01", avgLengthCm: 75 },
      ]),
      "c1",
      TODAY,
    )!;
    expect(b.text).toContain("Growth rate: 0.5 cm a day");
    expect(b.text).toContain("Projected forcing");
    expect(b.text).toContain("25 cm short of the forcing length");
  });

  it("carries the money in whole pesos, never centavos", () => {
    const b = cycleBriefing(L, "c1", TODAY)!;
    expect(b.text).toMatch(/Total cost: ₱[\d,]+\./);
    expect(b.text).not.toMatch(/₱[\d,]+\.\d\d/);
  });

  it("lists the tasks already planned, so nothing is suggested twice", () => {
    const planned: Ledger = {
      ...L,
      tasks: [{
        id: "t1", plotId: "p1", cycleId: "c1", title: "Apply liquid to force",
        activity: null, dueDate: "2024-06-10", isCritical: true, doneAt: null,
      }],
    };
    const b = cycleBriefing(planned, "c1", TODAY)!;
    expect(b.text).toContain("Apply liquid to force");
    expect(b.text).toContain("critical");
  });

  it("does not count a finished task as still planned", () => {
    const done: Ledger = {
      ...L,
      tasks: [{
        id: "t1", plotId: "p1", cycleId: "c1", title: "Deweed the west side",
        activity: null, dueDate: "2024-05-01", isCritical: false,
        doneAt: "2024-05-02T00:00:00Z",
      }],
    };
    expect(cycleBriefing(done, "c1", TODAY)!.text).not.toContain("Deweed the west side");
  });

  it("will not bother Claude with a plot that has nothing on it", () => {
    const empty: Ledger = {
      ...L, expenses: [], allocations: [], draws: [], harvests: [], leafMeasurements: [],
    };
    expect(cycleBriefing(empty, "c1", TODAY)!.isUseful).toBe(false);
    expect(cycleBriefing(L, "c1", TODAY)!.isUseful).toBe(true);
  });
});

describe("reading Claude's answer", () => {
  const good = {
    suggestions: [
      { title: "Measure D-leaf on 10 plants", due_date: "2024-06-05", is_critical: false, reason: "Last reading was five weeks ago." },
    ],
    note: "No plant count on file.",
  };

  it("takes a well-formed answer as it comes", () => {
    const r = readSuggestions(good, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]!.title).toBe("Measure D-leaf on 10 plants");
    expect(r.note).toBe("No plant count on file.");
  });

  it("drops a row that is missing what a task needs, rather than half-building one", () => {
    const r = readSuggestions(
      { suggestions: [...good.suggestions, { title: "x" }, { reason: "no title" }, 7], note: null },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions).toHaveLength(1);
    expect(r.note).toBeNull();
  });

  it("pulls a date in the past forward to today, because he cannot be on time for it otherwise", () => {
    const r = readSuggestions(
      { suggestions: [{ ...good.suggestions[0]!, due_date: "2023-01-01" }], note: null },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions[0]!.dueDate).toBe(TODAY);
  });

  it("refuses a date that is not a date at all", () => {
    const r = readSuggestions(
      { suggestions: [{ ...good.suggestions[0]!, due_date: "next week" }], note: null },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions).toEqual([]);
  });

  it("never shows more than five", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      ...good.suggestions[0]!, title: `Task ${i}`,
    }));
    const r = readSuggestions({ suggestions: many, note: null }, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions).toHaveLength(5);
  });

  it("says so plainly when the answer is not usable", () => {
    expect(readSuggestions(null, TODAY).ok).toBe(false);
    expect(readSuggestions({ suggestions: "soon" }, TODAY).ok).toBe(false);
  });

  it("treats anything but an explicit true as not critical", () => {
    const r = readSuggestions(
      { suggestions: [{ ...good.suggestions[0]!, is_critical: "yes" }], note: null },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions[0]!.isCritical).toBe(false);
  });
});
