/**
 * How far into its cycle a plot is, and who it can fairly be compared with.
 *
 * Age is counted from the cycle start — when land prep began — because that is
 * when the farm started spending on this crop, and the whole point of ranking
 * by age is to compare costs against plots at the same stage. A plot nineteen
 * months in has paid for everything a plot ten months in has not yet reached,
 * so putting their cost per plant side by side says nothing useful.
 *
 * The bands are the farm's own stages rather than even quarters. They are a
 * rough guide, not a schedule: pineapple here is rainfed and the crop takes as
 * long as it takes.
 */

import { todayISO } from "./dates";
import type { Cycle, ISODate } from "./types";

export type AgeBand = {
  key: string;
  label: string;
  /** Inclusive lower bound in months. */
  from: number;
  /** Exclusive upper bound, or null for the open-ended last band. */
  to: number | null;
  hint: string;
};

export const AGE_BANDS: readonly AgeBand[] = [
  { key: "establishing", label: "0–6 months", from: 0, to: 7,
    hint: "Establishing — land prep, planting, first fertiliser" },
  { key: "vegetative", label: "7–12 months", from: 7, to: 13,
    hint: "Vegetative growth" },
  { key: "approaching", label: "13–18 months", from: 13, to: 19,
    hint: "Approaching forcing" },
  { key: "overdue", label: "19 months and over", from: 19, to: null,
    hint: "Forced, or past when forcing was expected" },
] as const;

/** The crops whose plots are shown but kept out of the running order. */
const SET_ASIDE = new Set(["banana"]);

export function isSetAside(crop: string): boolean {
  return SET_ASIDE.has(crop.toLowerCase());
}

/**
 * Whole months since the cycle began, or null when nothing has started.
 *
 * Whole months rather than days because that is the unit the farm thinks in —
 * "nineteen months in" — and a figure to the day would imply a precision that a
 * remembered land-prep date does not have.
 */
export function cycleAgeMonths(cycle: Cycle, today: ISODate = todayISO()): number | null {
  const start = cycle.dateStarted ?? cycle.datePlanted;
  if (start === null || start > today) return null;
  return monthsBetween(start, today);
}

export function monthsBetween(from: ISODate, to: ISODate): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}

export function bandFor(months: number | null): AgeBand | null {
  if (months === null) return null;
  return (
    AGE_BANDS.find((b) => months >= b.from && (b.to === null || months < b.to)) ?? null
  );
}

/**
 * Oldest first, with the set-aside crops after everything else.
 *
 * A cycle with no start date sorts last among the ordinary plots rather than
 * first: an unknown age is not a great age, and putting it at the top would put
 * the least-known plot where the most-urgent one belongs.
 */
export function byAgeOldestFirst<T>(
  items: readonly T[],
  read: (item: T) => { cycle: Cycle },
  today: ISODate = todayISO(),
): T[] {
  return [...items].sort((a, b) => {
    const ca = read(a).cycle;
    const cb = read(b).cycle;
    const setAside = Number(isSetAside(ca.crop)) - Number(isSetAside(cb.crop));
    if (setAside !== 0) return setAside;

    const ma = cycleAgeMonths(ca, today);
    const mb = cycleAgeMonths(cb, today);
    if (ma === null && mb === null) return 0;
    if (ma === null) return 1;
    if (mb === null) return -1;
    return mb - ma;
  });
}

/** The same items, cut into bands, oldest band first, empty bands dropped. */
export function groupByBand<T>(
  items: readonly T[],
  read: (item: T) => { cycle: Cycle },
  today: ISODate = todayISO(),
): { band: AgeBand | null; items: T[] }[] {
  const ordered = byAgeOldestFirst(items, read, today);
  const groups: { band: AgeBand | null; items: T[] }[] = [];

  for (const band of [...AGE_BANDS].reverse()) {
    const inBand = ordered.filter((item) => {
      const cycle = read(item).cycle;
      if (isSetAside(cycle.crop)) return false;
      return bandFor(cycleAgeMonths(cycle, today))?.key === band.key;
    });
    if (inBand.length > 0) groups.push({ band, items: inBand });
  }

  // Anything with no start date, and the set-aside crops, gathered at the end.
  const rest = ordered.filter((item) => {
    const cycle = read(item).cycle;
    return isSetAside(cycle.crop) || cycleAgeMonths(cycle, today) === null;
  });
  if (rest.length > 0) groups.push({ band: null, items: rest });

  return groups;
}
