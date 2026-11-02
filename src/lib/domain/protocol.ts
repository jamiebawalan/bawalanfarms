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
 * 2. The app looks forward. An activity is the current thing to do for the
 *    month it belongs to and no longer; there is no backlog and no
 *    per-activity recoverability. The farm is correcting its protocols now,
 *    with a consultant walking the plots and soil tests coming in, so the
 *    catching-up is a conversation happening off the screen. Work that
 *    genuinely needs doing late gets entered by hand.
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

/**
 * How long an activity stays the current thing to do.
 *
 * A block at month 5.3 is in the middle of month 5, so the month-5 work is
 * this month's work, not late work. One month of grace is what makes that
 * true; past it, the month is over.
 *
 * There is deliberately no per-activity recoverability, and no backlog. The
 * farm is correcting its protocols now with a consultant walking the plots,
 * so the catching-up is a conversation happening off the screen. What the
 * app owes Anthony is the next thing, not an argument about the last one.
 * Work that genuinely needs doing late gets entered by hand.
 */
export const DUE_WINDOW_MONTHS = 1;

export type SuggestionOptions = {
  /** How far ahead to look. One month, so the next round is visible. */
  aheadMonths?: number;
  /** How long an activity stays current after its month arrives. */
  dueWindowMonths?: number;
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
  const window = options.dueWindowMonths ?? DUE_WINDOW_MONTHS;

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

    return monthsLate <= window;
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
  windowMonths: number = DUE_WINDOW_MONTHS,
): Activity[] {
  if (accepted.series === null) return [];
  /*
   * Only rounds that could still have been on the screen. Answering the
   * month-9 foliar on a plot that has been running all year should not
   * write eight superseded rows for months nobody was ever shown — that is
   * manufacturing a backlog at the moment of closing one.
   */
  const floor = accepted.mapMonth - windowMonths;
  return activities.filter(
    (a) =>
      a.series === accepted.series &&
      a.code !== accepted.code &&
      a.mapMonth < accepted.mapMonth &&
      a.mapMonth >= floor &&
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

// ---------------------------------------------------------------------------
// What to actually carry out to the field
// ---------------------------------------------------------------------------

export type Material = {
  code: string;
  name: string;
  kind: string;
  analysis: string | null;
  /** What a purchase of it is measured in: kg or L. */
  unit: "kg" | "L";
  note: string | null;
  /** The stock this draws from. Null where the farm does not carry it. */
  inputType?: string | null;
};

export type QtyUnit = "g_per_plant" | "g_per_1000sqm" | "ml_per_1000sqm";

export type ActivityMaterial = {
  activityCode: string;
  materialCode: string;
  qty: number;
  qtyUnit: QtyUnit;
  /** Dissolve in this order. Urea last. Null for anything not mixed in a tank. */
  mixOrder: number | null;
  note: string | null;
};

export type Dose = {
  material: Material;
  /** Grams for a solid, millilitres for a liquid. The honest number. */
  amount: number;
  /** Grams and millilitres, or kilos and litres once the figure is big enough. */
  display: string;
  mixOrder: number | null;
  note: string | null;
};

/** The ground a block covers, for the per-area doses. */
export type BlockSize = {
  plants: number | null;
  areaSqm: number | null;
};

/**
 * How much of each product this round needs on this block.
 *
 * Returns the lines it can work out and says which it cannot, rather than
 * guessing. A per-plant dose with no plant count is not a small problem to
 * paper over: the whole protocol is per-plant, and a made-up number here is
 * a sack of urea either wasted or short.
 */
export function dosesFor(
  activity: Activity,
  materials: readonly ActivityMaterial[],
  catalogue: ReadonlyMap<string, Material>,
  size: BlockSize,
): { doses: Dose[]; missing: "plants" | "area" | null } {
  const lines = materials
    .filter((m) => m.activityCode === activity.code)
    .sort((a, b) => (a.mixOrder ?? 99) - (b.mixOrder ?? 99));
  if (lines.length === 0) return { doses: [], missing: null };

  const needsPlants = lines.some((l) => l.qtyUnit === "g_per_plant");
  const needsArea = lines.some((l) => l.qtyUnit !== "g_per_plant");
  if (needsPlants && (size.plants === null || size.plants <= 0)) {
    return { doses: [], missing: "plants" };
  }
  if (needsArea && (size.areaSqm === null || size.areaSqm <= 0)) {
    return { doses: [], missing: "area" };
  }

  const doses: Dose[] = [];
  for (const line of lines) {
    const material = catalogue.get(line.materialCode);
    if (material === undefined) continue;

    const amount =
      line.qtyUnit === "g_per_plant"
        ? line.qty * (size.plants ?? 0)
        : line.qty * ((size.areaSqm ?? 0) / 1000);

    doses.push({
      material,
      amount,
      display: formatAmount(amount, line.qtyUnit === "ml_per_1000sqm" ? "ml" : "g"),
      mixOrder: line.mixOrder,
      note: line.note,
    });
  }
  return { doses, missing: null };
}

/**
 * Grams up to a kilo, then kilos. Millilitres up to a litre, then litres.
 *
 * Two significant figures past the point at most, and none where the number
 * is already big: nobody weighs 6.675 kg of urea, and printing it that way
 * only suggests a scale the farm does not own. Small numbers keep their
 * decimals, because 2.3 g of zinc sulfate rounded to 2 is an 13% error.
 */
export function formatAmount(amount: number, unit: "g" | "ml"): string {
  const big = unit === "g" ? "kg" : "L";
  if (amount >= 1000) {
    const v = amount / 1000;
    return `${v >= 100 ? Math.round(v) : Number(v.toFixed(2))} ${big}`;
  }
  if (amount >= 100) return `${Math.round(amount)} ${unit}`;
  if (amount >= 10) return `${Number(amount.toFixed(1))} ${unit}`;
  return `${Number(amount.toFixed(2))} ${unit}`;
}

/**
 * The ground and the plants a block covers.
 *
 * A block's area is its share of the plot, because that is the only figure
 * anybody has: he estimates the share standing in the field and nobody is
 * going to walk a GPS around an internal line. The plant count is counted,
 * not apportioned — a block that is 30% of the land can hold 45% of the
 * plants, and the protocol's per-plant doses care about the plants.
 */
export function sizeOf(
  block: { landPct: number; plantCount: number | null } | null,
  plot: { areaSqm: number | null; plants: number | null },
): BlockSize {
  if (block === null) return { plants: plot.plants, areaSqm: plot.areaSqm };
  return {
    plants: block.plantCount,
    areaSqm: plot.areaSqm === null ? null : plot.areaSqm * (block.landPct / 100),
  };
}

// ---------------------------------------------------------------------------
// Whether the plot can be forced
// ---------------------------------------------------------------------------

/**
 * The protocol's forcing criteria, in grams.
 *
 * Weight, not height, and not age. The old rule read D-leaf length against a
 * farm setting; the protocol is explicit that height is reference only
 * (about 1.2 m at 2.7 kg, at Del Monte's density, which is not ours).
 */
export const FORCING = {
  /** Average plant weight. Good fields reach 3.0 kg. */
  averageMin: 2700,
  /** Over-robust plants are hard to force, so there is a ceiling too. */
  averageMax: 3300,
  /** The share of plants that must themselves be at or above the minimum. */
  shareMin: 0.85,
  /** No plant lighter than this. */
  lightestMin: 2200,
  /** Del Monte will force at this on a poor field. Below the protocol's own bar. */
  poorFieldFloor: 2500,
} as const;

export type ForcingCheck = {
  /** Every criterion met: force it. */
  ready: boolean;
  weighed: number;
  averageGrams: number;
  shareAtWeight: number;
  lightestGrams: number;
  heaviestGrams: number;
  /** Each criterion, in the protocol's own order, for showing the working. */
  criteria: { label: string; want: string; got: string; met: boolean }[];
  /** Why it is not ready, in one line, or null when it is. */
  blocker: string | null;
};

/**
 * Read a weight survey against the protocol.
 *
 * Needs the individual plant weights, not an average: three of the four
 * criteria are about the spread, and an average alone cannot tell a plot of
 * even 2.8 kg plants from one where half are 2.2 and half are 3.4. The second
 * is not ready to force and the average says it is.
 */
export function forcingReadiness(weightsGrams: readonly number[]): ForcingCheck | null {
  const weights = weightsGrams.filter((w) => Number.isFinite(w) && w > 0);
  if (weights.length === 0) return null;

  const total = weights.reduce((sum, w) => sum + w, 0);
  const average = total / weights.length;
  const atWeight = weights.filter((w) => w >= FORCING.averageMin).length;
  const share = atWeight / weights.length;
  const lightest = Math.min(...weights);
  const heaviest = Math.max(...weights);

  const kg = (g: number) => `${(g / 1000).toFixed(1)} kg`;
  const pct = (f: number) => `${Math.round(f * 100)}%`;

  const criteria = [
    {
      label: "Average plant weight",
      want: `at least ${kg(FORCING.averageMin)}`,
      got: kg(average),
      met: average >= FORCING.averageMin,
    },
    {
      label: `Plants at ${kg(FORCING.averageMin)} or more`,
      want: `at least ${pct(FORCING.shareMin)}`,
      got: `${pct(share)} (${atWeight} of ${weights.length})`,
      met: share >= FORCING.shareMin,
    },
    {
      label: "Lightest plant",
      want: `at least ${kg(FORCING.lightestMin)}`,
      got: kg(lightest),
      met: lightest >= FORCING.lightestMin,
    },
    {
      label: "Average not over",
      want: kg(FORCING.averageMax),
      got: kg(average),
      met: average <= FORCING.averageMax,
    },
  ];

  const failed = criteria.filter((c) => !c.met);
  const first = failed[0];

  return {
    ready: failed.length === 0,
    weighed: weights.length,
    averageGrams: Math.round(average),
    shareAtWeight: Math.round(share * 100) / 100,
    lightestGrams: Math.round(lightest),
    heaviestGrams: Math.round(heaviest),
    criteria,
    blocker:
      first === undefined
        ? null
        : `${first.label} is ${first.got}; the protocol wants ${first.want}.`,
  };
}

// ---------------------------------------------------------------------------
// Turning a plot dose into knapsack loads
// ---------------------------------------------------------------------------

/**
 * Del Monte's spray volume: 2,000 L of water per hectare of plot area.
 *
 * Water goes on by area, product goes on by plant. That sounds like a
 * contradiction and is not: the area sets how much liquid it takes to wet
 * the plot, the plant count sets how much product is dissolved in it.
 */
export const LITRES_PER_HECTARE = 2000;

/** What the farm actually carries. */
export const KNAPSACK_LITRES = 16;

/**
 * Below this, a field weighing is a guess.
 *
 * Zinc sulfate comes out at about 2.3 g in a 16 L knapsack. Nobody is
 * weighing 2.3 g on a hillside, and eyeballing it is how a plot gets four
 * times the zinc it needed. These are weighed once for the whole plot and
 * handed out as liquid.
 */
export const PREMIX_BELOW_GRAMS = 5;

export type TankLine = {
  material: Material;
  /** Grams or millilitres for one full tank. */
  amount: number;
  display: string;
  mixOrder: number | null;
  /**
   * Too small to weigh per tank. Weigh the plot's whole amount once,
   * dissolve it, and pour a measured share into each tank.
   */
  premix: { totalDisplay: string; dissolveInMl: number; perTankMl: number } | null;
};

export type TankPlan = {
  tankLitres: number;
  /** Water the whole plot needs, in litres. */
  waterLitres: number;
  /** Finished mix each plant receives. The protocol expects 60 to 90 ml. */
  mlPerPlant: number;
  plantsPerTank: number;
  /** Full tanks, plus a part tank where the plot does not divide evenly. */
  fullTanks: number;
  /** Plants the last, partial tank covers. Zero when it divides evenly. */
  lastTankPlants: number;
  lines: TankLine[];
  /** Said plainly when the mix falls outside what the protocol expects. */
  warning: string | null;
};

/**
 * How to load the knapsack.
 *
 * The grams in the protocol are per plant, so a tank is only correct for
 * exactly the plants it was mixed for. That is the part that goes wrong in a
 * field: a tank mixed for 190 plants and stretched over 260 underfeeds every
 * one of them, and the plot finishes with product left over or runs dry
 * early. So this says how many plants one tank covers and how many tanks the
 * plot takes, and expects the sprayer to finish as the tank empties.
 */
export function tankPlan(
  activity: Activity,
  materials: readonly ActivityMaterial[],
  catalogue: ReadonlyMap<string, Material>,
  size: BlockSize,
  tankLitres: number = KNAPSACK_LITRES,
): TankPlan | null {
  // Only sprays are mixed in a tank. Granules go on the soil by hand.
  if (activity.basis !== "per_plant") return null;
  const { doses } = dosesFor(activity, materials, catalogue, size);
  if (doses.length === 0) return null;

  const plants = size.plants;
  const areaSqm = size.areaSqm;
  if (plants === null || plants <= 0 || areaSqm === null || areaSqm <= 0) return null;

  const waterLitres = (areaSqm / 10_000) * LITRES_PER_HECTARE;
  const mlPerPlant = (waterLitres * 1000) / plants;
  const plantsPerTank = Math.floor((tankLitres * 1000) / mlPerPlant);
  if (plantsPerTank <= 0) return null;

  const fullTanks = Math.floor(plants / plantsPerTank);
  const lastTankPlants = plants - fullTanks * plantsPerTank;

  const lines: TankLine[] = doses.map((d) => {
    const perPlant = d.amount / plants;
    const perTank = perPlant * plantsPerTank;
    const isSolid = !d.display.endsWith("L") && !d.display.endsWith("ml");

    /*
     * The premix. Dissolve the plot's whole amount in 100 ml per tank, then
     * pour 100 ml into each — one weighing on a bench instead of fourteen
     * guesses on a slope, and the arithmetic is a round number either way.
     */
    const tanksTotal = fullTanks + (lastTankPlants > 0 ? 1 : 0);
    const needsPremix = isSolid && perTank < PREMIX_BELOW_GRAMS && tanksTotal > 1;

    return {
      material: d.material,
      amount: perTank,
      display: formatAmount(perTank, isSolid ? "g" : "ml"),
      mixOrder: d.mixOrder,
      premix: needsPremix
        ? {
            totalDisplay: d.display,
            dissolveInMl: tanksTotal * 100,
            perTankMl: 100,
          }
        : null,
    };
  });

  return {
    tankLitres,
    waterLitres: Math.round(waterLitres),
    mlPerPlant: Math.round(mlPerPlant),
    plantsPerTank,
    fullTanks,
    lastTankPlants,
    lines,
    warning: mixWarning(mlPerPlant),
  };
}

/**
 * The protocol expects 60 to 90 ml of finished mix per plant.
 *
 * Outside that, something upstream is wrong — usually a plant count that
 * does not match the block, or a land share that does not. Saying so beats
 * printing a confident tank recipe built on a bad number.
 */
function mixWarning(mlPerPlant: number): string | null {
  if (mlPerPlant < 60) {
    return (
      `Only ${Math.round(mlPerPlant)} ml of mix per plant — the protocol expects 60 to 90. ` +
      "Check the plant count and the block's share of the plot before mixing."
    );
  }
  if (mlPerPlant > 90) {
    return (
      `${Math.round(mlPerPlant)} ml of mix per plant — the protocol expects 60 to 90. ` +
      "Check the plant count and the block's share of the plot before mixing."
    );
  }
  return null;
}
