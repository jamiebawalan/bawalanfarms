/**
 * D-leaf readings, and what the plants in one look like together.
 *
 * The average is what times the forcing. The spread is what says whether the
 * block will force together at all: twenty plants averaging 57 cm can be a
 * tidy row between 54 and 60, or a mess between 27 and 79, and only one of
 * those is a block you can treat as a unit. The farm has already decided to
 * manage this — sorting planting material by size before planting — so the
 * number that shows whether it is working belongs on the screen.
 */

import type { LeafMeasurement, LeafPlantReading, Ledger } from "./types";

export type Reading = {
  id: string;
  date: string;
  avgLengthCm: number;
  sampleSize: number | null;
  /** The individual plants, shortest first. Empty for an imported average. */
  plants: number[];
  shortestCm: number | null;
  tallestCm: number | null;
  /** How far a typical plant sits from the average. Null without the plants. */
  spreadCm: number | null;
};

export function readingsFor(ledger: Ledger, cycleId: string): Reading[] {
  const byMeasurement = new Map<string, LeafPlantReading[]>();
  for (const plant of ledger.leafPlants) {
    byMeasurement.set(plant.measurementId, [
      ...(byMeasurement.get(plant.measurementId) ?? []),
      plant,
    ]);
  }

  return ledger.leafMeasurements
    .filter((m) => m.cycleId === cycleId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => describe(m, byMeasurement.get(m.id) ?? []));
}

function describe(m: LeafMeasurement, plants: LeafPlantReading[]): Reading {
  const lengths = plants
    .slice()
    .sort((a, b) => a.plantNo - b.plantNo)
    .map((p) => p.lengthCm);

  if (lengths.length === 0) {
    return {
      id: m.id, date: m.date, avgLengthCm: m.avgLengthCm,
      sampleSize: m.sampleSize, plants: [],
      shortestCm: null, tallestCm: null, spreadCm: null,
    };
  }

  const mean = lengths.reduce((a, v) => a + v, 0) / lengths.length;
  return {
    id: m.id,
    date: m.date,
    avgLengthCm: round(mean),
    sampleSize: lengths.length,
    plants: lengths,
    shortestCm: Math.min(...lengths),
    tallestCm: Math.max(...lengths),
    spreadCm: standardDeviation(lengths),
  };
}

/**
 * Population standard deviation, not sample.
 *
 * These twenty plants are not an estimate of a wider population the farm cares
 * about; they are the sample, and the question is how varied *they* are. The
 * distinction barely moves the number at n=20, but the honest one is cheaper to
 * explain a year from now.
 */
export function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const variance =
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return round(Math.sqrt(variance));
}

/**
 * How uneven a block is, in words.
 *
 * A number alone means nothing to someone standing in a field. The bands come
 * from what the farm's own readings look like: the tidiest block on record sits
 * near 6 cm, the worst near 13.
 */
export function evenness(spreadCm: number | null): {
  label: string;
  tone: "good" | "warn" | "danger";
} | null {
  if (spreadCm === null) return null;
  if (spreadCm < 7) return { label: "even", tone: "good" };
  if (spreadCm < 11) return { label: "uneven", tone: "warn" };
  return { label: "very uneven", tone: "danger" };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
