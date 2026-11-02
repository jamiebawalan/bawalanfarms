/**
 * What the protocol says to do on this block, right now.
 *
 * The protocol pins every activity to a month after planting. A block sits at
 * some month. The gap between the two is the whole question, and three things
 * about that gap are easy to get wrong:
 *
 * 1. MAP is not calendar age. A plot planted in December 2025 can be at month
 *    8, not eleven: it is where the plant has got to, not how long it has been
 *    in the ground. So the stage is entered once, as the date the block would
 *    have been planted to be where it is, and the date advances by itself.
 *
 * 2. A missed round is usually not worth going back for, but not always. The
 *    month-5 potash is still worth giving in month 6; the drainage canals are
 *    not worth digging under a standing crop. That is an agronomy judgement,
 *    so it is authored per activity (`recoverableMonths`) and never inferred.
 *
 * 3. Doing a later round of a programme closes the earlier ones — but only of
 *    the same programme. Spraying the month-5 foliar means the month-4 foliar
 *    is past, because they are rounds of one thing and you do not feed twice
 *    to catch up. It does not mean the ant bait went down, and it certainly
 *    does not mean the drainage got dug. Rounds are tied together by `series`
 *    and nothing closes across series.
 */

import { todayISO } from "./dates";
import type { ISODate } from "./types";

export type Basis = "per_plant" | "per_area" | "none";

export type Activity = {
  code: string;
  mapMonth: number;
  category: string;
  title: string;
  instruction: string;
  basis: Basis;
  /** Rounds of one programme. Null means it stands alone. */
  series: string | null;
  /** Months late it is still worth doing. Null means the window shuts with its month. */
  recoverableMonths: number | null;
  /** Mutually exclusive options for one decision. */
  choiceGroup: string | null;
  isDefault: boolean;
  condition: string | null;
  sortOrder: number;
};

export type PlanState = "scheduled" | "skipped" | "done";

export type PlanRow = {
  activityCode: string;
  state: PlanState;
};

/** Days in an average month. MAP is a growth stage, so a month is nominal. */
const MONTH_DAYS = 30.4375;

/**
 * The date a block would have been planted to be at the stage it is at.
 *
 * He tells the app "this block is at month five"; the app stores a date. The
 * alternative — storing the number 5 — is wrong four weeks later and would
 * mean re-entering a stage for every block on the farm every month, for ever.
 */
export function plantedOnForMap(map: number, today: ISODate = todayISO()): ISODate {
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - Math.round(map * MONTH_DAYS));
  return t.toISOString().slice(0, 10) as ISODate;
}

/** And back again: where a block sits now, to one decimal place. */
export function mapForPlantedOn(
  plantedOn: ISODate,
  today: ISODate = todayISO(),
): number {
  const from = Date.parse(`${plantedOn}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  const months = (to - from) / (MONTH_DAYS * 86_400_000);
  return Math.round(months * 10) / 10;
}

export type Timing =
  /** Its month has come and it is not late. */
  | { kind: "due" }
  /** Late, but still inside the window the agronomy allows. */
  | { kind: "late"; monthsLate: number }
  /** Its month has not come yet. */
  | { kind: "ahead"; monthsAway: number };

export type Suggestion = {
  /** The activity to offer, or the default of a group of choices. */
  activity: Activity;
  /** The alternatives, when this is one decision with options. Never empty with a choiceGroup. */
  options: readonly Activity[];
  timing: Timing;
};

export type SuggestionOptions = {
  /** How far ahead to look. One month, so the next round is visible. */
  aheadMonths?: number;
  /** A hard cap on looking back, whatever an activity claims it can recover. */
  backMonths?: number;
};

/**
 * Everything worth offering on a block at this stage, most urgent first.
 *
 * Deliberately not a backlog. Anything closed by a later round of its own
 * series, already answered, or past the window its own agronomy allows is
 * gone from this list — the owners can still see it was missed, because the
 * misses are recorded, but the man standing in the field is not asked to
 * answer for a month that is over.
 */
export function suggestionsFor(
  map: number,
  activities: readonly Activity[],
  plan: readonly PlanRow[] = [],
  options: SuggestionOptions = {},
): Suggestion[] {
  const ahead = options.aheadMonths ?? 1;
  const back = options.backMonths ?? 2;

  const answered = new Set(plan.map((p) => p.activityCode));

  /*
   * A decision answered is a decision closed. Picking ammonium sulfate at
   * month 2 settles the month-2 nitrogen; the DAP option must not still be
   * sitting there, or he will do both and double the nitrogen.
   */
  const settled = new Set(
    activities
      .filter((a) => a.choiceGroup !== null && answered.has(a.code))
      .map((a) => a.choiceGroup as string),
  );

  /*
   * The latest round of each series whose month has arrived. Accepting the
   * month-5 round of a programme closes month 4 of that programme, and the
   * mere arrival of month 5 does too: a round nobody did is still a round
   * that has been overtaken.
   */
  const reached = new Map<string, number>();
  for (const a of activities) {
    if (a.series === null || a.mapMonth > map) continue;
    const best = reached.get(a.series);
    if (best === undefined || a.mapMonth > best) reached.set(a.series, a.mapMonth);
  }

  const open = activities.filter((a) => {
    if (answered.has(a.code)) return false;
    if (a.choiceGroup !== null && settled.has(a.choiceGroup)) return false;

    const monthsLate = map - a.mapMonth;

    if (monthsLate < 0) return -monthsLate <= ahead;

    // Overtaken by a later round of its own programme — never by another's.
    if (a.series !== null) {
      const latest = reached.get(a.series);
      if (latest !== undefined && latest > a.mapMonth) return false;
    }

    if (monthsLate === 0) return true;
    const recoverable = Math.min(a.recoverableMonths ?? 0, back);
    return monthsLate <= recoverable;
  });

  // One decision with options shows as one row, with its default on top.
  const byGroup = new Map<string, Activity[]>();
  const standalone: Activity[] = [];
  for (const a of open) {
    if (a.choiceGroup === null) {
      standalone.push(a);
      continue;
    }
    const group = byGroup.get(a.choiceGroup);
    if (group === undefined) byGroup.set(a.choiceGroup, [a]);
    else group.push(a);
  }

  const timingOf = (a: Activity): Timing => {
    const late = map - a.mapMonth;
    if (late < 0) return { kind: "ahead", monthsAway: Math.round(-late * 10) / 10 };
    if (late === 0) return { kind: "due" };
    return { kind: "late", monthsLate: Math.round(late * 10) / 10 };
  };

  const out: Suggestion[] = standalone.map((a) => ({
    activity: a,
    options: [],
    timing: timingOf(a),
  }));

  for (const group of byGroup.values()) {
    const ordered = [...group].sort(
      (x, y) => Number(y.isDefault) - Number(x.isDefault) || x.sortOrder - y.sortOrder,
    );
    const head = ordered[0];
    if (head === undefined) continue;
    out.push({ activity: head, options: ordered, timing: timingOf(head) });
  }

  /*
   * Late first, because a window that is closing is the only thing here with
   * a deadline; then what is due; then what is coming. Within each, by month,
   * so the oldest unfinished work is at the top.
   */
  const rank = (s: Suggestion): number =>
    s.timing.kind === "late" ? 0 : s.timing.kind === "due" ? 1 : 2;

  return out.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.activity.mapMonth - b.activity.mapMonth ||
      a.activity.sortOrder - b.activity.sortOrder,
  );
}

/**
 * Which activities a newly-answered one closes.
 *
 * Returned so they can be written down as superseded rather than quietly
 * dropped. The farm's record should say the plant missed the month-4 foliar;
 * it is just that nobody is going to be asked to do it now.
 */
export function supersededBy(
  accepted: Activity,
  activities: readonly Activity[],
  answered: ReadonlySet<string> = new Set(),
): Activity[] {
  if (accepted.series === null) return [];
  return activities.filter(
    (a) =>
      a.series === accepted.series &&
      a.code !== accepted.code &&
      a.mapMonth < accepted.mapMonth &&
      !answered.has(a.code),
  );
}

/** How a month reads to someone who thinks in stages, not in numbers. */
export function describeTiming(timing: Timing): string {
  if (timing.kind === "due") return "due now";
  if (timing.kind === "ahead") {
    return timing.monthsAway <= 0.5 ? "coming up" : "next month";
  }
  if (timing.monthsLate <= 0.5) return "just overdue";
  if (timing.monthsLate < 1.5) return "a month late";
  return `${Math.round(timing.monthsLate)} months late`;
}
