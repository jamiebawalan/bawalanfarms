/**
 * What the plants in a reading look like together.
 *
 * The average times the forcing; the spread says whether the block will force
 * together at all. These are the owner's own May readings from Plot 20 — twenty
 * plants averaging 56.65 cm, ranging from 27 to 79 — which is precisely the
 * case a lone average hides.
 */
import { describe, expect, it } from "vitest";
import { evenness, readingsFor, standardDeviation } from "./leaf";
import { makeLedger } from "./fixture";
import type { Ledger } from "./types";

const PLOT_20_MAY = [67, 56, 62, 65, 64, 64, 56, 49, 45, 43, 46, 79, 72, 52, 27, 45, 63, 51, 60, 67];

const withPlants = (lengths: number[]): Ledger => ({
  ...makeLedger(),
  leafMeasurements: [
    { id: "m1", cycleId: "c1", date: "2026-05-01", avgLengthCm: 0, sampleSize: null },
  ],
  leafPlants: lengths.map((cm, i) => ({
    measurementId: "m1", plantNo: i + 1, lengthCm: cm,
  })),
});

describe("a reading built from its plants", () => {
  const [r] = readingsFor(withPlants(PLOT_20_MAY), "c1");

  it("computes the average rather than trusting one that was typed", () => {
    expect(r!.avgLengthCm).toBe(56.65);
  });

  it("keeps the shortest and tallest, which is what a mean hides", () => {
    expect(r!.shortestCm).toBe(27);
    expect(r!.tallestCm).toBe(79);
  });

  it("counts the plants it actually has, not what was claimed", () => {
    expect(r!.sampleSize).toBe(20);
    expect(r!.plants).toHaveLength(20);
  });

  it("measures how far a typical plant sits from the average", () => {
    // Population standard deviation: 11.77 for these twenty. The sample figure
    // would be 12.08 — these plants are the thing being described, not an
    // estimate of a wider population, so the population figure is the honest one.
    expect(r!.spreadCm).toBe(11.77);
  });
});

describe("a reading imported as an average alone", () => {
  const ledger: Ledger = {
    ...makeLedger(),
    leafMeasurements: [
      { id: "m1", cycleId: "c1", date: "2026-05-01", avgLengthCm: 54.6, sampleSize: 20 },
    ],
    leafPlants: [],
  };
  const [r] = readingsFor(ledger, "c1");

  it("keeps the average it was given, having nothing to recompute from", () => {
    expect(r!.avgLengthCm).toBe(54.6);
    expect(r!.sampleSize).toBe(20);
  });

  it("says nothing about spread rather than inventing zero", () => {
    // A blank means "not known". A zero would mean "every plant identical".
    expect(r!.spreadCm).toBeNull();
    expect(r!.shortestCm).toBeNull();
    expect(evenness(r!.spreadCm)).toBeNull();
  });
});

describe("spread", () => {
  it("is nothing at all for a single plant", () => {
    expect(standardDeviation([50])).toBeNull();
    expect(standardDeviation([])).toBeNull();
  });

  it("is zero when every plant is the same length", () => {
    expect(standardDeviation([60, 60, 60, 60])).toBe(0);
  });

  it("grows as the plants diverge", () => {
    const tidy = standardDeviation([54, 56, 57, 58, 60])!;
    const messy = standardDeviation([27, 45, 57, 68, 79])!;
    expect(messy).toBeGreaterThan(tidy);
  });
});

describe("putting the spread in words", () => {
  it("calls the owner's worst block very uneven", () => {
    // Plot 20 in May: 27 to 79 cm. Not a block that will force as one.
    const [r] = readingsFor(withPlants(PLOT_20_MAY), "c1");
    expect(evenness(r!.spreadCm)!.label).toBe("very uneven");
    expect(evenness(r!.spreadCm)!.tone).toBe("danger");
  });

  it("calls a tight block even", () => {
    expect(evenness(4)!.label).toBe("even");
    expect(evenness(4)!.tone).toBe("good");
  });

  it("has a middle for the ones that are neither", () => {
    expect(evenness(9)!.label).toBe("uneven");
  });
});

describe("readings for a cycle", () => {
  it("come back oldest first, so a timeline reads left to right", () => {
    const ledger: Ledger = {
      ...makeLedger(),
      leafMeasurements: [
        { id: "b", cycleId: "c1", date: "2026-06-01", avgLengthCm: 59.5, sampleSize: 20 },
        { id: "a", cycleId: "c1", date: "2026-05-01", avgLengthCm: 56.65, sampleSize: 20 },
      ],
      leafPlants: [],
    };
    expect(readingsFor(ledger, "c1").map((r) => r.date))
      .toEqual(["2026-05-01", "2026-06-01"]);
  });

  it("does not mix in another plot's plants", () => {
    const ledger: Ledger = {
      ...makeLedger(),
      leafMeasurements: [
        { id: "mine", cycleId: "c1", date: "2026-05-01", avgLengthCm: 0, sampleSize: null },
        { id: "theirs", cycleId: "c2", date: "2026-05-01", avgLengthCm: 0, sampleSize: null },
      ],
      leafPlants: [
        { measurementId: "mine", plantNo: 1, lengthCm: 60 },
        { measurementId: "theirs", plantNo: 1, lengthCm: 10 },
      ],
    };
    expect(readingsFor(ledger, "c1")[0]!.avgLengthCm).toBe(60);
  });
});
