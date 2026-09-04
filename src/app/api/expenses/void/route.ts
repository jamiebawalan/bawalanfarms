import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { humanise, isEntryFault } from "@/lib/expense-payload";

/**
 * Deleting a cost.
 *
 * The row is marked void rather than removed. Two reasons, and both matter more
 * than the tidiness of a real delete: deleting is owner-only by policy, so a
 * real delete would mean the farm manager could not undo his own mistake
 * without asking; and a ledger that changes shape between two readings is the
 * thing the owners left the spreadsheet to escape.
 *
 * A void drops out of every report — loadLedger never returns it — so to
 * everyone using the app the entry is gone.
 */
const Body = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, "Say why you are deleting it."),
  revision_id: z.string().uuid().optional(),
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { error } = await supabase.rpc("void_expense", {
    p_id: parsed.data.id,
    p_reason: parsed.data.reason,
    p_revision: parsed.data.revision_id ?? null,
  });
  if (error) {
    return NextResponse.json(
      { error: humanise(error.message) },
      { status: isEntryFault(error) ? 400 : 500 },
    );
  }

  return NextResponse.json({ id: parsed.data.id });
}
