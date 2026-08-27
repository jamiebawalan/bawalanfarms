import { matchActivity, matchCategory, normalise } from "./vocab";
import { splitByArea } from "@/lib/domain/split";
import { toCentavos } from "@/lib/domain/money";
import type { ExpenseCategory, FarmWideReason, ISODate, LabourMode } from "@/lib/domain/types";

/**
 * Turning the owner's cleaned workbook into rows this app will accept.
 *
 * The rule is that nothing is ever dropped in silence. Every row comes back
 * either as an expense to write or as a rejection with a reason in plain
 * language, and rows that were accepted with a judgement call come back with a
 * warning attached so the owners can see what was assumed on their behalf.
 */

export type PlotRef = { id: string; code: string; label: string; areaSqm: number | null };

export type ParsedExpense = {
  importKey: string;
  rowNumber: number;
  date: ISODate;
  category: ExpenseCategory;
  activity: string;
  activityOtherNote?: string;
  attribution: "direct" | "split" | "farm_wide";
  farmWideReason?: FarmWideReason;
  labourMode?: LabourMode;
  unitPriceCentavos: number | null;
  quantity: number | null;
  amountCentavos: number;
  paidTo?: string;
  note?: string;
  allocations: { plotId: string; amountCentavos: number }[];
  warnings: string[];
};

export type Rejection = { rowNumber: number; reason: string; raw: string };

export type ParseResult = {
  expenses: ParsedExpense[];
  rejections: Rejection[];
  /** Header names in the file that nothing was read from. */
  unusedColumns: string[];
  warningCounts: Record<string, number>;
};

/** Header aliases, because no two versions of the sheet name things the same. */
const COLUMNS: Record<string, string[]> = {
  date: ["date", "day", "petsa"],
  category: ["category", "type", "cost type", "expense category"],
  activity: ["activity", "expense", "particulars", "particular", "description",
             "work", "details", "item", "expense detail"],
  plots: ["plot", "plots", "plot no", "plot number", "plot ids", "lote"],
  amount: ["amount", "total", "cost", "peso", "php", "halaga", "amount php"],
  unitPrice: ["unit price", "rate", "price", "per unit", "unit cost"],
  quantity: ["quantity", "qty", "count", "people", "no of people", "pax", "days"],
  labourMode: ["labour mode", "labor mode", "mode", "pakyaw"],
  paidTo: ["paid to", "payee", "supplier", "who", "name"],
  note: ["note", "notes", "remarks", "comment"],
  reason: ["reason", "farm wide reason", "why"],
};

export function parseExpenseSheet(
  rows: string[][],
  plots: readonly PlotRef[],
  activities: readonly { code: string; label: string }[],
  opts: { sheetTag: string; today: ISODate },
): ParseResult {
  const expenses: ParsedExpense[] = [];
  const rejections: Rejection[] = [];
  const warningCounts: Record<string, number> = {};

  const header = rows[0];
  if (!header) {
    return {
      expenses: [], unusedColumns: [], warningCounts,
      rejections: [{ rowNumber: 0, reason: "The sheet is empty.", raw: "" }],
    };
  }

  const index = mapColumns(header);
  const missing = (["date", "amount"] as const).filter((k) => index[k] === undefined);
  if (missing.length > 0) {
    return {
      expenses: [], unusedColumns: [], warningCounts,
      rejections: [{
        rowNumber: 1,
        reason:
          `The sheet needs a ${missing.join(" and a ")} column. ` +
          `Found: ${header.filter(Boolean).join(", ")}`,
        raw: header.join(" | "),
      }],
    };
  }

  const used = new Set(Object.values(index).filter((i): i is number => i !== undefined));
  const unusedColumns = header
    .map((h, i) => (h.trim() !== "" && !used.has(i) ? h.trim() : null))
    .filter((h): h is string => h !== null);

  const plotByCode = new Map(plots.map((p) => [String(p.code).toLowerCase(), p]));

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const rowNumber = r + 1;
    const raw = row.join(" | ");
    const cell = (key: keyof typeof COLUMNS) => {
      const i = index[key];
      return i === undefined ? "" : (row[i] ?? "").trim();
    };
    const reject = (reason: string) => rejections.push({ rowNumber, reason, raw });
    const warnings: string[] = [];
    const warn = (w: string) => {
      warnings.push(w);
      warningCounts[w] = (warningCounts[w] ?? 0) + 1;
    };

    // --- date ---
    const date = parseDate(cell("date"));
    if (date === null) {
      reject(`Could not read the date "${cell("date")}".`);
      continue;
    }
    if (date < "2015-01-01") {
      reject(`The date ${date} is before the farm's records start.`);
      continue;
    }
    if (date > opts.today) {
      // Nine rows in the old book were dated a year late. Never guessed at.
      reject(`The date ${date} is in the future — check the year.`);
      continue;
    }

    // --- amount ---
    const amountCentavos = parseMoney(cell("amount"));
    if (amountCentavos === null) {
      reject(`Could not read the amount "${cell("amount")}".`);
      continue;
    }
    if (amountCentavos <= 0) {
      reject(`The amount is ${cell("amount")}, which is not a cost.`);
      continue;
    }

    // --- activity ---
    const activityRaw = cell("activity");
    const matched = matchActivity(activityRaw, activities);
    let activity: string;
    let activityOtherNote: string | undefined;
    if (matched === null) {
      if (activityRaw === "") {
        reject("No activity given, and there is nothing to infer it from.");
        continue;
      }
      // Kept, not dropped, and flagged so the owners can add the term.
      activity = "other";
      activityOtherNote = activityRaw;
      warn("Activity not in the vocabulary — imported as Other with the original text kept");
    } else {
      activity = matched.code;
      if (!matched.exact) {
        warn("Activity spelling normalised to the vocabulary");
      }
    }

    // --- category ---
    let category = matchCategory(cell("category"));
    if (category === null) {
      const inferred = inferCategory(activity);
      if (inferred === null) {
        reject(
          cell("category") === ""
            ? "No category, and none could be inferred from the activity."
            : `Category "${cell("category")}" is not one of the six.`,
        );
        continue;
      }
      category = inferred;
      warn(
        cell("category") === ""
          ? "Category was blank — taken from the activity"
          : "Category spelling normalised",
      );
    }

    // --- plots ---
    const plotCell = cell("plots");
    const plotsParsed = parsePlotList(plotCell, plotByCode);
    if (plotsParsed.error !== null) {
      reject(plotsParsed.error);
      continue;
    }

    let attribution: ParsedExpense["attribution"];
    let allocations: { plotId: string; amountCentavos: number }[] = [];
    let farmWideReason: FarmWideReason | undefined;

    if (plotsParsed.plots.length === 0) {
      attribution = "farm_wide";
      farmWideReason = matchReason(cell("reason")) ?? inferReason(category);
      if (matchReason(cell("reason")) === null) {
        // ₱609,203 sat unattributed in the old book because blank was easiest.
        // Historical blanks are given a reason from the category and flagged,
        // rather than rejecting a quarter of the file.
        warn(`Whole-farm with no reason given — recorded as "${farmWideReason}"`);
      }
    } else if (plotsParsed.plots.length === 1) {
      attribution = "direct";
      allocations = [{ plotId: plotsParsed.plots[0]!.id, amountCentavos }];
    } else {
      attribution = "split";
      const split = splitByArea(
        amountCentavos,
        plotsParsed.plots.map((p) => ({ plotId: p.id, label: p.label, areaSqm: p.areaSqm })),
      );
      if (split.lines.length === 0) {
        reject(
          `None of the plots (${plotCell}) has a surveyed area, so the cost cannot be split.`,
        );
        continue;
      }
      if (split.excluded.length > 0) {
        warn(
          `Split excluded ${split.excluded.map((e) => e.label).join(", ")} — no surveyed area`,
        );
      }
      allocations = split.lines.map((l) => ({
        plotId: l.plotId,
        amountCentavos: l.amountCentavos,
      }));
    }

    // --- unit maths ---
    const unitPriceCentavos = parseMoney(cell("unitPrice"));
    const quantity = parseNumber(cell("quantity"));
    let keepUnit = unitPriceCentavos !== null && quantity !== null && quantity > 0;
    if (keepUnit && Math.round(unitPriceCentavos! * quantity!) !== amountCentavos) {
      // The database refuses an amount that disagrees with its own working, and
      // the amount column is the figure the family reconciled against.
      warn("Unit price times quantity did not equal the amount — kept the amount");
      keepUnit = false;
    }

    expenses.push({
      importKey: `${opts.sheetTag}:${rowNumber}`,
      rowNumber,
      date,
      category,
      activity,
      activityOtherNote,
      attribution,
      farmWideReason,
      labourMode: category === "Labor" ? matchLabourMode(cell("labourMode")) : undefined,
      unitPriceCentavos: keepUnit ? unitPriceCentavos : null,
      quantity: keepUnit ? quantity : null,
      amountCentavos,
      paidTo: cell("paidTo") || undefined,
      note: cell("note") || undefined,
      allocations,
      warnings,
    });
  }

  return { expenses, rejections, unusedColumns, warningCounts };
}

// --- cell parsing ----------------------------------------------------------

function mapColumns(header: string[]): Partial<Record<keyof typeof COLUMNS, number>> {
  const index: Partial<Record<keyof typeof COLUMNS, number>> = {};
  const cells = header.map((h) => normalise(h));

  for (const [key, aliases] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string[]][]) {
    const exact = cells.findIndex((c) => aliases.includes(c));
    if (exact >= 0) { index[key] = exact; continue; }
    const partial = cells.findIndex((c) => c !== "" && aliases.some((a) => c === a || c.startsWith(`${a} `)));
    if (partial >= 0) index[key] = partial;
  }
  // "amount" must not steal the column "unit price" already claimed.
  if (index.amount !== undefined && index.amount === index.unitPrice) delete index.amount;
  return index;
}

export function parseDate(raw: string): ISODate | null {
  const text = raw.trim();
  if (text === "") return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  // An Excel serial that the reader did not recognise as a date.
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const ms = Math.round((Number(text) - 25569) * 86_400_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  // "4 Mar 2024", "March 4, 2024", "4/3/2024" — day first, as written here.
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text);
  if (slash) {
    const [, a, b, c] = slash as unknown as [string, string, string, string];
    const year = Number(c.length === 2 ? `20${c}` : c);
    const day = Number(a);
    const month = Number(b);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return iso(year, month, day);
    }
    return null;
  }

  const parsed = Date.parse(`${text} UTC`);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseMoney(raw: string): number | null {
  const text = raw.replace(/[₱,\s]/g, "").replace(/^\((.*)\)$/, "-$1").trim();
  if (text === "" || !/^-?\d*\.?\d+$/.test(text)) return null;
  return toCentavos(Number(text));
}

function parseNumber(raw: string): number | null {
  const text = raw.replace(/,/g, "").trim();
  if (text === "" || !/^-?\d*\.?\d+$/.test(text)) return null;
  return Number(text);
}

/**
 * Reading a plot cell.
 *
 * This is where the corruption showed up: "24/2" and "17, 18" typed into a text
 * column, and Excel turning some of them into dates. A cell that now looks like
 * a date is called out by name rather than quietly skipped, because it means a
 * real plot list was destroyed and someone has to go and look at it.
 */
export function parsePlotList(
  raw: string,
  plotByCode: Map<string, PlotRef>,
): { plots: PlotRef[]; error: null } | { plots: never[]; error: string } {
  const text = raw.trim();
  if (text === "" || /^(farm|whole farm|all|general|n\/?a|-)$/i.test(text)) {
    return { plots: [], error: null };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text) || /^\d{5}(\.\d+)?$/.test(text)) {
    return {
      plots: [],
      error:
        `The plot cell reads "${text}", which is a date. Excel converted a plot ` +
        `list such as "24/2" into one. The original list has to be recovered by hand.`,
    };
  }

  const tokens = text.split(/[,;/&+]|\band\b/i).map((t) => t.trim()).filter(Boolean);
  const found: PlotRef[] = [];
  const unknown: string[] = [];

  for (const token of tokens) {
    const key = token.toLowerCase().replace(/^plot\s*/, "").trim();
    const plot = plotByCode.get(key);
    if (plot) {
      if (!found.some((p) => p.id === plot.id)) found.push(plot);
    } else {
      unknown.push(token);
    }
  }

  if (unknown.length > 0) {
    return {
      plots: [],
      error: `No plot matches ${unknown.map((u) => `"${u}"`).join(", ")}.`,
    };
  }
  return { plots: found, error: null };
}

function matchReason(raw: string): FarmWideReason | null {
  const n = normalise(raw);
  if (n === "") return null;
  if (/vehicle|truck|car|motor/.test(n)) return "vehicle";
  if (/sell|market|toll|haul/.test(n)) return "selling";
  if (/animal|dog|carabao|livestock/.test(n)) return "animal_care";
  if (/general|farm|misc/.test(n)) return "general";
  return null;
}

function inferReason(category: ExpenseCategory): FarmWideReason {
  if (category === "Machines" || category === "Farm Transport") return "vehicle";
  if (category === "Selling Transport") return "selling";
  return "general";
}

function matchLabourMode(raw: string): LabourMode | undefined {
  const n = normalise(raw);
  if (n.includes("pakyaw")) return "pakyaw";
  if (n.includes("kasama")) return "kasama";
  if (n.includes("daily") || n.includes("araw")) return "daily";
  return undefined;
}

/** The category an activity almost always belongs to, for blank category cells. */
function inferCategory(activity: string): ExpenseCategory | null {
  const inputs = [
    "fert_21_0_0", "fert_16_20_0", "fert_0_0_60", "fruiting_formula", "ethrel",
    "onecide", "diuron", "agroxone", "herbicides", "insecticides", "food",
  ];
  const selling = ["kalakal", "lalamove", "trucking", "toll_gate"];
  const machines = ["tractor", "barang", "araro_repair", "diesel", "mechanic"];

  if (inputs.includes(activity)) return "Farm Inputs";
  if (selling.includes(activity)) return "Selling Transport";
  if (machines.includes(activity)) return "Machines";
  if (activity === "other") return null;
  return "Labor";
}
