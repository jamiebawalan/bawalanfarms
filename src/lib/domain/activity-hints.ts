/**
 * Helping the right field win.
 *
 * Eighteen months of logging put ₱102,000 into "Other" that already had a
 * home: vehicle repairs when `Barang` existed, payees typed into the note
 * when `paid_to` existed, "Plot 25 and 26" written out when the attribution
 * chips were right there. Nothing was unrecordable. The wrong field was
 * simply the nearest one — "Other" sat in the shortlist and everything else
 * was behind a button marked "show all 52".
 *
 * So this does two things, neither of which is a longer list: it finds the
 * activity somebody means from the words they used, and it notices when what
 * they typed is not an activity at all.
 */

/** Words that mean an activity, beyond its own label. */
const SYNONYMS: Record<string, string[]> = {
  machine_repair: [
    "repair", "repairs", "parts", "fix", "barang", "mechanic", "bearing",
    "bearings", "joint", "joints", "seal", "seals", "chassis", "differential",
    "hydroback", "synchroniz", "sychroniz", "wrangler", "tyre", "tire",
  ],
  machine_fuel: ["fuel", "diesel", "gas", "gasoline", "petrol", "tank"],
  side_dress: [
    "fertiliz", "fertilz", "abono", "urea", "16-20", "0-0-60", "21-0-0",
    "dap", "potash", "sack", "sacks", "magnesium", "zinc", "epsom",
  ],
  foliar: ["foliar", "spray fertiliz", "liquid fertiliz"],
  weed_manual: ["tabas", "deweed", "damo", "hand weed", "weeding", "cut back"],
  weed_spray: [
    "herbicide", "chemical deweed", "onecide", "diuron", "agroxone", "ametryn",
    "glyphosate", "round-up", "roundup",
  ],
  pest_spray: ["insecticide", "mealybug", "pest", "sumithion", "movento", "diazol"],
  ant_bait: ["ant bait", "siege", "ants"],
  fungicide: ["fungicide", "aliette", "phosphonate", "p-micro", "root rot"],
  forcing: ["ethrel", "ethephon", "forcing", "force"],
  ripening: ["pampahinog", "ripening", "embark", "cpa"],
  plant: ["tanim", "planting", "plant"],
  layout: ["layout", "lay out", "lay-out"],
  gather_material: ["suwe", "salo", "binhi", "slips", "suckers", "planting material"],
  stack_haul: ["hakot", "haul", "kamada", "baba"],
  haul_to_buyer: ["kalakal", "lalamove", "delivery", "buyer"],
  tolls: ["toll", "trucking", "rfid"],
  harvest: ["harvest", "ani", "pitas"],
  decrown: ["decrown", "crown"],
  crew_food: ["food", "lunch", "pagkain", "meal", "merienda", "baon"],
  animal_care_new: ["vet", "meds", "medicine", "alaga", "animal care", "balot"],
  animal_feed_new: ["feed", "kalabaw feed", "animal feed"],
  trash: ["trash", "basura", "garbage", "rubbish"],
  plot_edges: ["perimeter", "edging", "edges", "clean open", "clearing"],
  infrastructure: ["kubo", "construction", "building", "shed", "fence"],
  fetch_water: ["igib", "fetch water", "water"],
  admin: ["subscription", "chatgpt", "office", "newspaper", "courier", "stapler"],
  travel_training: ["agrilink", "trip", "seminar", "training", "conference"],
  crew_other: ["accomodation", "accommodation", "lodging", "lodge"],
  vehicle: ["hilux", "byd", "scooter", "motor", "taillight", "car "],
  peanut_seed: ["mane binhi", "mani binhi", "peanut seed"],
  peanut_shell: ["himay"],
  peanut_plant: ["mane planting", "mani planting", "plant mane", "peanut plant"],
  peanut_cutback: ["tabas mane", "tabas mani"],
  peanut_harvest: ["harvest mane", "ani mane", "peanut harvest"],
  rip: ["ripper", "rip", "subsoil", "subsoiler"],
  moldboard: ["moldboard", "mouldboard", "turn over"],
  araro: ["araro", "carabao plough", "carabao plow"],
  harrow: ["harrow", "suyod"],
  form_beds: ["bed former", "bed forming", "beds"],
  clear_crop: ["flail", "chop", "mow", "mower"],
  tractor_hire: ["tractor"],
  soil_test: ["soil test", "soil sample"],
  plant_count: ["plant count", "counting"],
  weight_survey: ["weight survey", "weighing", "weigh"],
  tissue_test: ["tissue test", "d-leaf", "dleaf"],
};

export type ActivityOption = {
  code: string;
  label: string;
  activityGroup: string;
};

export type Hint = {
  code: string;
  label: string;
  /** Why it was offered, in the words that matched. */
  because: string;
};

/**
 * Activities that might be what somebody meant.
 *
 * Label first, because an exact word in the name is the strongest signal,
 * then the synonyms. Capped at three: a list of guesses as long as the list
 * it is replacing helps nobody.
 */
export function hintsFor(
  text: string,
  activities: readonly ActivityOption[],
  limit = 3,
): Hint[] {
  const needle = text.trim().toLowerCase();
  if (needle.length < 3) return [];

  const scored: { hint: Hint; score: number }[] = [];
  for (const a of activities) {
    if (a.code === "other") continue;
    const label = a.label.toLowerCase();

    // The whole label, or a distinctive word from it.
    if (label.includes(needle) || needle.includes(stripQualifier(label))) {
      scored.push({ hint: { code: a.code, label: a.label, because: a.label }, score: 3 });
      continue;
    }

    const hit = (SYNONYMS[a.code] ?? []).find((w) => needle.includes(w));
    if (hit !== undefined) {
      scored.push({ hint: { code: a.code, label: a.label, because: hit }, score: 2 });
    }
  }

  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((s) => s.hint);
}

/** "Form the beds (bed former)" -> "form the beds" */
function stripQualifier(label: string): string {
  const cut = label.indexOf(" (");
  return (cut === -1 ? label : label.slice(0, cut)).trim();
}

export type FieldNudge = {
  field: "paid_to" | "attribution";
  message: string;
};

/**
 * When what was typed is not an activity at all.
 *
 * *Daddy* went into a note eight times and *Plot 25 and 26* once, for
 * ₱84,000 between them, because the note was the field in front of him. Both
 * columns already existed. This is not validation — it never blocks a save —
 * it just says the thing out loud at the moment it can still be fixed.
 */
export function nudgeFor(
  text: string,
  activities: readonly ActivityOption[],
): FieldNudge | null {
  const t = text.trim();
  if (t.length < 3) return null;

  if (/\bplots?\s*\d/i.test(t)) {
    return {
      field: "attribution",
      message:
        "That looks like a plot. Plots go in “Where did it go?” below, so the " +
        "cost lands on them — in the note it cannot be split or counted.",
    };
  }

  /*
   * A name: one or two capitalised words, no digits, matching no activity.
   * Deliberately narrow. Nudging somebody about a word that was fine is how
   * a helpful prompt turns into something people learn to tap past.
   */
  const words = t.split(/\s+/);
  const looksLikeName =
    words.length <= 2 &&
    !/\d/.test(t) &&
    words.every((w) => /^[A-Z][a-z’'-]+$/.test(w)) &&
    hintsFor(t, activities).length === 0;

  if (looksLikeName) {
    return {
      field: "paid_to",
      message: `If ${t} is who you paid, there is a “Paid to” box further down. ` +
        "Names in the note cannot be totalled.",
    };
  }

  return null;
}
