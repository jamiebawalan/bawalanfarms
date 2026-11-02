import { NextResponse } from "next/server";
import { z } from "zod";
import { UNSETTLED_CODES } from "@/lib/db/cost-review";
import { createClient } from "@/lib/supabase/server";

/**
 * Assigning an activity to everything filed under one word.
 *
 * A phrase typed eight times is answered once: the update matches on the
 * words rather than on a row, so the whole group moves together.
 *
 * Every row keeps what it had. `legacy_activity` takes the old code and
 * `legacy_note` the free text, so the answer can always be read back against
 * what was actually written — and corrected, if a phrase turns out to have
 * meant two different things.
 */
const Assign = z.object({
  /** 'note' for free text under Other; 'code' for an unsettled activity. */
  kind: z.enum(["note", "code"]),
  /** The exact note, or the activity code. */
  key: z.string().min(1).max(400),
  to_activity: z.string().min(1).max(60),
});

export async function POST(request: Request) {
  const parsed = Assign.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Nothing to assign." }, { status: 400 });
  }
  const { kind, key, to_activity } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The target has to be a real, current activity — not a retired one, and
  // never "other", which is what this exists to empty.
  const { data: target } = await supabase
    .from("activities")
    .select("code, default_category")
    .eq("code", to_activity)
    .eq("active", true)
    .maybeSingle();
  /*
   * Never onto "other", and never onto a code that is itself waiting on a
   * decision — including itself. Both would take the row out of the queue
   * without answering anything, which is worse than leaving it: it marks
   * work as done that was not done.
   */
  if (
    target === null ||
    to_activity === "other" ||
    (UNSETTLED_CODES as readonly string[]).includes(to_activity)
  ) {
    return NextResponse.json(
      { error: "That is not an activity you can file things under." },
      { status: 400 },
    );
  }

  if (kind === "code" && !(UNSETTLED_CODES as readonly string[]).includes(key)) {
    return NextResponse.json(
      { error: "That activity is not waiting on a decision." },
      { status: 400 },
    );
  }

  /*
   * Only rows that have not already been answered. Without this, assigning a
   * phrase twice would overwrite legacy_activity with the new code and lose
   * the original — the one thing this whole exercise is meant to preserve.
   */
  const rows = supabase
    .from("expenses")
    .select("id, activity, activity_other_note, note")
    .is("voided_at", null)
    .is("legacy_activity", null)
    .eq("activity", kind === "code" ? key : "other");

  const { data: candidates, error: readFailed } = await rows;
  if (readFailed !== null) {
    return NextResponse.json({ error: readFailed.message }, { status: 400 });
  }

  const wanted = key.trim().toLowerCase();
  const ids = (candidates ?? [])
    .filter((row) => {
      if (kind === "code") return true;
      const r = row as Record<string, unknown>;
      const written =
        (r.activity_other_note as string | null) ?? (r.note as string | null) ?? "";
      return written.trim().toLowerCase() === wanted;
    })
    .map((row) => String((row as Record<string, unknown>).id));

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, moved: 0 });
  }

  /*
   * "Magnesium Sulfate" is more than "Side-dress", so the words are kept
   * where they can still be read on the cost list rather than only in the
   * audit column. Rows that already say something in their note keep it.
   */
  if (kind === "note") {
    const blank = (candidates ?? [])
      .filter((row) => {
        const r = row as Record<string, unknown>;
        const note = (r.note as string | null) ?? "";
        return ids.includes(String(r.id)) && note.trim() === "";
      })
      .map((row) => String((row as Record<string, unknown>).id));
    if (blank.length > 0) {
      await supabase.from("expenses").update({ note: key }).in("id", blank);
    }
  }

  const { error } = await supabase
    .from("expenses")
    .update({
      activity: to_activity,
      legacy_activity: kind === "code" ? key : "other",
      // The words are kept on the row they were typed on, not just in a log.
      legacy_note: kind === "note" ? key : null,
      // The escape hatch's own field is emptied: the row is no longer "Other".
      activity_other_note: null,
    })
    .in("id", ids);

  if (error !== null) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, moved: ids.length });
}
