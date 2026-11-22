import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Stock used on a plot, said in one breath.
 *
 * The Stock screen takes one lot at a time, which is right when you are
 * standing at the shed counting sacks. On a plot page it is the wrong shape:
 * a round of work uses four things at once, and four separate trips through
 * a form is four chances to stop halfway and leave a plot half-costed.
 *
 * So this takes the whole set. Every line carries an id made on the phone, so
 * a reply lost to a dropped signal replays without drawing the stock twice —
 * the duplicate key is the proof it already landed, not a failure.
 *
 * Partial success is deliberate. The lines go in as one insert: if the shed
 * cannot cover one of them, none of them land, and he is told which. A plot
 * costed for three of the four things he used would be worse than one costed
 * for none, because only the second is obviously wrong.
 */

const Line = z.object({
  id: z.string().uuid(),
  purchase_id: z.string().uuid(),
  quantity: z.number().positive(),
});

const Body = z.object({
  cycle_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** What the stock was used for, where he said. Free text, his words. */
  note: z.string().max(200).optional(),
  lines: z.array(Line).min(1).max(40),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" ") },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email ?? null;

  const { cycle_id, date, note, lines } = parsed.data;
  const { error } = await supabase.from("input_draws").insert(
    lines.map((l) => ({
      id: l.id,
      purchase_id: l.purchase_id,
      cycle_id,
      reason: "applied",
      date,
      quantity: l.quantity,
      dose_note: note,
      created_by: email,
    })),
  );

  if (error !== null && !isDuplicate(error.message)) {
    return NextResponse.json({ error: humanise(error.message) }, { status: 400 });
  }
  return NextResponse.json({ drawn: lines.length });
}

/** A replayed queued write hits the primary key. That is success, not failure. */
function isDuplicate(message: string): boolean {
  return /duplicate key value/.test(message);
}

/**
 * The database's words are precise and unreadable in a field. These are the
 * two refusals this route can actually provoke.
 */
function humanise(message: string): string {
  if (/holds/.test(message) || /over$/.test(message)) {
    return "The shed does not have that much left. Nothing was taken out — check the amounts and try again.";
  }
  if (/is closed/.test(message)) {
    return "This cycle is closed. Reopen it before recording anything against it.";
  }
  return message;
}
