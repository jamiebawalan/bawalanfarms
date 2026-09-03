import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ExpensePayload, humanise, isEntryFault } from "@/lib/expense-payload";

/**
 * Correcting a cost that was already saved.
 *
 * Deliberately a POST of the whole entry rather than a patch of the fields that
 * moved. The form he corrects on is the form he entered on, and it can only
 * tell you what the entry says now — not which taps changed it. Replacing the
 * whole thing also means the split is recomputed from the corrected amount
 * instead of being left half-adjusted.
 *
 * The version before the change is kept in expense_revisions by the database,
 * so a corrected figure never quietly replaces the one the owners last read.
 */
export async function POST(request: Request) {
  const parsed = ExpensePayload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" ") },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.rpc("update_expense", { payload: parsed.data });
  if (error) {
    return NextResponse.json(
      { error: humanise(error.message) },
      { status: isEntryFault(error) ? 400 : 500 },
    );
  }

  return NextResponse.json({ id: data });
}
