/**
 * What is still filed under a word instead of an activity.
 *
 * Two kinds of thing, and they are the same job to clear: about a hundred
 * phrases typed into "Other", and the seven old codes nobody has yet said the
 * meaning of. Both are "we know money was spent, we do not know on what", and
 * both are answered by picking an activity.
 *
 * Grouped by the exact words, so a phrase used eight times is answered once.
 */

import { createAdminClient } from "@/lib/supabase/server";

/**
 * Codes kept active through 0032 because their meaning was unsettled.
 *
 * `other` is not here: it is the escape hatch and stays. These are specific
 * jobs whose name does not say which protocol activity they are — "Spray"
 * could be herbicide, pesticide, fungicide or foliar feed, and guessing would
 * write the guess into eighteen months of history.
 */
export const UNSETTLED_CODES = [
  "spray", "liquid", "stab_drop", "pinya_trimming",
  "material_collection", "fruiting_formula", "land_prep",
] as const;

export type ReviewRow = {
  /** 'note' for free text under Other; 'code' for an unsettled activity. */
  kind: "note" | "code";
  /** What identifies it: the exact note, or the activity code. */
  key: string;
  /** What to show: the words typed, or the activity's label. */
  text: string;
  entries: number;
  pesos: number;
  /** A worked example, so a vague phrase can be placed. */
  sampleNote: string | null;
  sampleDate: string | null;
};

export async function loadCostReview(): Promise<ReviewRow[]> {
  const supabase = createAdminClient();

  const [expenses, activities] = await Promise.all([
    supabase
      .from("expenses")
      .select("activity, activity_other_note, note, amount_centavos, date")
      .is("voided_at", null)
      .is("legacy_activity", null),
    supabase.from("activities").select("code, label"),
  ]);
  if (expenses.error !== null) return [];

  const labels = new Map<string, string>(
    (activities.data ?? []).map((a: Record<string, unknown>) =>
      [String(a.code), String(a.label)] as [string, string]),
  );

  const groups = new Map<string, ReviewRow>();
  for (const row of expenses.data ?? []) {
    const e = row as Record<string, unknown>;
    const code = String(e.activity);
    const isOther = code === "other";
    const unsettled = (UNSETTLED_CODES as readonly string[]).includes(code);
    if (!isOther && !unsettled) continue;

    const written =
      (e.activity_other_note as string | null) ?? (e.note as string | null) ?? "";
    const key = isOther ? `note:${written.trim().toLowerCase()}` : `code:${code}`;

    const existing = groups.get(key);
    const pesos = Number(e.amount_centavos) / 100;
    if (existing === undefined) {
      groups.set(key, {
        kind: isOther ? "note" : "code",
        key: isOther ? written.trim() : code,
        text: isOther ? written.trim() || "(no note)" : labels.get(code) ?? code,
        entries: 1,
        pesos,
        sampleNote: isOther ? null : ((e.note as string | null) ?? null),
        sampleDate: (e.date as string | null) ?? null,
      });
    } else {
      existing.entries += 1;
      existing.pesos += pesos;
      // Keep the first note that says anything, as the worked example.
      if (existing.sampleNote === null && typeof e.note === "string" && e.note !== "") {
        existing.sampleNote = e.note;
      }
    }
  }

  // Biggest first: clearing a 50,000-peso phrase is worth more than a 400.
  return [...groups.values()].sort((a, b) => b.pesos - a.pesos);
}
