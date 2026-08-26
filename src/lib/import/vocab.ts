/**
 * Mapping the old workbook's free text onto the vocabulary.
 *
 * The old data held `Fertilizer Application`, `Fertlizer Application 21-0-0`,
 * `Abono Apply` and `Abono Application` as four separate strings for one
 * activity. Matching is deliberately conservative: it normalises spelling and
 * consults an explicit synonym list, and anything it cannot place is reported
 * for a human to decide rather than guessed into the nearest bucket.
 */

import type { ExpenseCategory } from "@/lib/domain/types";

/** Lowercase, strip punctuation and fertiliser grades, collapse whitespace. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+\s*-\s*\d+\s*-\s*\d+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Old spellings, misspellings and shorthands, mapped to activity codes. */
const ACTIVITY_SYNONYMS: Record<string, string> = {
  "fertilizer application": "abono",
  "fertlizer application": "abono",
  "fertiliser application": "abono",
  "abono apply": "abono",
  "abono application": "abono",
  "abono": "abono",
  "apply fertilizer": "abono",
  "araro": "araro",
  "plough": "araro",
  "plow": "araro",
  "land prep": "land_prep",
  "land preparation": "land_prep",
  "plot clearing": "plot_clearing",
  "clearing": "plot_clearing",
  "plot edging": "plot_edging",
  "edging": "plot_edging",
  "tanim": "tanim",
  "planting": "tanim",
  "pinya planting": "pinya_planting",
  "banana planting": "banana_planting",
  "corn planting": "corn_planting",
  "coffee planting": "coffee_planting",
  "suwe": "suwe_gathering",
  "planting material gathering": "suwe_gathering",
  "suwe planting material gathering": "suwe_gathering",
  "hakot planting material": "hakot_material",
  "hakot": "hakot_material",
  "material collection": "material_collection",
  "stab drop": "stab_drop",
  "stabdrop": "stab_drop",
  "spray": "spray",
  "spraying": "spray",
  "deweed": "deweed",
  "deweeding": "deweed",
  "weeding": "deweed",
  "pakyaw deweed": "pakyaw_deweed",
  "tabas": "tabas",
  "tabas mane": "tabas_mane",
  "vine removal": "vine_removal",
  "kill saging": "kill_saging",
  "pinya trimming": "pinya_trimming",
  "trimming": "pinya_trimming",
  "decrowning": "decrowning",
  "liquid": "liquid",
  "igib": "igib",
  "fetch water": "igib",
  "food": "food",
  "pagkain": "food",
  "meal": "food",
  "meals": "food",
  "ethrel": "ethrel",
  "onecide": "onecide",
  "diuron": "diuron",
  "agroxone": "agroxone",
  "herbicide": "herbicides",
  "herbicides": "herbicides",
  "insecticide": "insecticides",
  "insecticides": "insecticides",
  "fruiting formula": "fruiting_formula",
  "harvest": "harvesting",
  "harvesting": "harvesting",
  "kalakal": "kalakal",
  "kamada": "kamada",
  "lalamove": "lalamove",
  "trucking": "trucking",
  "truck": "trucking",
  "toll gate": "toll_gate",
  "tollgate": "toll_gate",
  "toll": "toll_gate",
  "tractor": "tractor",
  "barang": "barang",
  "araro repair": "araro_repair",
  "diesel": "diesel",
  "fuel": "diesel",
  "mechanic": "mechanic",
};

/** Fertiliser grades named in an activity cell map to the input, not the labour. */
const FERTILISER_BY_GRADE: Record<string, string> = {
  "21-0-0": "fert_21_0_0",
  "16-20-0": "fert_16_20_0",
  "0-0-60": "fert_0_0_60",
};

export function matchActivity(
  raw: string,
  known: readonly { code: string; label: string }[],
): { code: string; exact: boolean } | null {
  const text = raw.trim();
  if (text === "") return null;

  // A cell naming a fertiliser grade is about the input, e.g. "Fertilizer 21-0-0".
  for (const [grade, code] of Object.entries(FERTILISER_BY_GRADE)) {
    if (text.includes(grade) && /fert|abono/i.test(text)) {
      return { code, exact: false };
    }
  }

  const n = normalise(text);
  const byCode = known.find((a) => a.code === text.toLowerCase().replace(/\s+/g, "_"));
  if (byCode) return { code: byCode.code, exact: true };

  const byLabel = known.find((a) => normalise(a.label) === n);
  if (byLabel) return { code: byLabel.code, exact: true };

  const synonym = ACTIVITY_SYNONYMS[n];
  if (synonym) return { code: synonym, exact: false };

  // "Abono Apply 21-0-0" and the like: try the leading words.
  const words = n.split(" ");
  for (let take = words.length - 1; take >= 1; take--) {
    const prefix = words.slice(0, take).join(" ");
    const hit = ACTIVITY_SYNONYMS[prefix];
    if (hit) return { code: hit, exact: false };
  }

  return null;
}

const CATEGORY_SYNONYMS: Record<string, ExpenseCategory> = {
  "labor": "Labor",
  "labour": "Labor",
  "farm inputs": "Farm Inputs",
  "farm input": "Farm Inputs",
  "inputs": "Farm Inputs",
  "farm transport": "Farm Transport",
  "selling transport": "Selling Transport",
  "selling": "Selling Transport",
  "machines": "Machines",
  "machine": "Machines",
  "machinery": "Machines",
  "miscellaneous": "Miscellaneous",
  "miscelaneous": "Miscellaneous",
  "misc": "Miscellaneous",
};

export function matchCategory(raw: string): ExpenseCategory | null {
  return CATEGORY_SYNONYMS[normalise(raw)] ?? null;
}
